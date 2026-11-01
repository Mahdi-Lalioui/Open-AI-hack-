/**
 * Design Studio API (mounted at /api/design). Every Blueprint is validated before it is stored,
 * and renderers and exporters only ever see stored versions.
 */
import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { DESIGN_TEMPLATES } from '../../shared/blueprint/templates';
import type { DesignBlueprint } from '../../shared/blueprint/types';
import { validateBlueprint } from '../../shared/blueprint/validate';
import { EXPORT_FORMATS, exportDesign, type ExportFormat } from '../../shared/blueprint/export';
import type { DesignSource, DesignVersionSummary, StudioDesign } from '../../shared/blueprint/api';
import { RULE_HELP, RuleError, interpretWithRules, refineWithRules } from '../design/rules';
import { OpenAIError } from '../openai';
import { OutOfScopeError, type DesignAi } from '../openai/design';
import type { ImageMime } from '../openai/vision';
import { MAX_IMAGE_BYTES, sniffImage } from './ai';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_DESIGNS = 100;
const MAX_VERSIONS = 50;

interface Version extends DesignVersionSummary { blueprint: DesignBlueprint; warnings: string[]; notes: string[] }
interface Stored { id: string; versions: Version[] }

const engine = z.enum(['ai', 'rules']).optional();
const interpretSchema = z.object({
  templateId: z.string().max(64).optional(),
  /** A Blueprint file the user saved earlier. */
  blueprint: z.unknown().optional(),
  text: z.string().trim().max(2000).optional(),
  image: z.object({ base64: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 1.4)) }).optional(),
  engine,
});
const refineSchema = z.object({
  id: z.string().max(64),
  instruction: z.string().trim().min(1).max(1000).optional(),
  blueprint: z.unknown().optional(),
  summary: z.string().trim().max(120).optional(),
  /** What the browser is showing, in case this server instance never saw the design. */
  current: z.unknown().optional(),
  engine,
});
const exportSchema = z.object({ id: z.string().max(64), format: z.string().max(32), version: z.number().int().positive().optional(), current: z.unknown().optional() });

function sendError(res: Response, status: number, code: string, error: string, details?: string[]) {
  res.status(status).json({ ok: false, error, code, details });
}

export function createDesignRouter(ai: DesignAi, options: { liveTest: boolean } = { liveTest: true }): Router {
  const router = Router();
  const designs = new Map<string, Stored>();
  let nextId = 1;
  let aiBusy = false;

  router.use(express.json({ limit: Math.ceil(MAX_IMAGE_BYTES * 1.5) }));

  const toClient = (d: Stored): StudioDesign => {
    const v = d.versions[d.versions.length - 1];
    return {
      id: d.id,
      version: v.version,
      blueprint: v.blueprint,
      warnings: v.warnings,
      notes: v.notes,
      source: v.source,
      history: d.versions.map(({ version, summary, source }) => ({ version, summary, source })),
    };
  };

  const addVersion = (d: Stored, blueprint: DesignBlueprint, warnings: string[], source: DesignSource, summary: string, notes: string[]) => {
    d.versions.push({ version: (d.versions[d.versions.length - 1]?.version ?? 0) + 1, blueprint, warnings, source, summary, notes });
    if (d.versions.length > MAX_VERSIONS) d.versions.shift();
    return toClient(d);
  };

  const create = (blueprint: DesignBlueprint, warnings: string[], source: DesignSource, summary: string, notes: string[]) => {
    const id = `d${nextId++}`;
    const d: Stored = { id, versions: [] };
    designs.set(id, d);
    if (designs.size > MAX_DESIGNS) designs.delete(designs.keys().next().value as string);
    return addVersion(d, blueprint, warnings, source, summary, notes);
  };

  /**
   * Serverless hosts can send each request to a fresh instance with empty memory.
   * The browser's copy is validated like any other input, and nothing else is taken on trust.
   */
  const findOrRestore = (id: string, current: unknown): Stored | null => {
    const known = designs.get(id);
    if (known || current === undefined) return known ?? null;
    const checked = validateBlueprint(current);
    if (!checked.ok) return null;
    const restored: Stored = { id, versions: [] };
    designs.set(id, restored);
    addVersion(restored, checked.blueprint, checked.warnings, { kind: 'file', label: 'Restored from your browser' }, 'Restored', []);
    return restored;
  };

  /** A failed design never replaces the current one, so the host can keep going on stage. */
  const sendFailure = (res: Response, err: unknown) => {
    if (err instanceof RuleError) return sendError(res, 422, 'rules_not_understood', err.message);
    if (err instanceof OutOfScopeError) return sendError(res, 422, 'out_of_scope', err.message);
    if (err instanceof OpenAIError) return sendError(res, err.httpStatus, err.code, err.message);
    console.error('[design] failed:', (err as Error)?.message ?? err);
    return sendError(res, 500, 'server_error', 'Something went wrong on the server. The current design was kept.');
  };

  const withAi = async <T>(res: Response, run: () => Promise<T>): Promise<T | null> => {
    if (aiBusy) {
      sendError(res, 409, 'busy', 'The AI is still working on the last request. Wait for it to finish.');
      return null;
    }
    aiBusy = true;
    try {
      return await run();
    } catch (err) {
      sendFailure(res, err);
      return null;
    } finally {
      aiBusy = false;
    }
  };

  router.get('/status', (_req, res) => {
    res.json({
      ok: true,
      ai: { configured: ai.configured, model: ai.configured ? ai.model : null, transcribeModel: ai.configured ? ai.transcribeModel : null },
      templates: DESIGN_TEMPLATES.map(({ id, title, scenario }) => ({ id, title, scenario })),
      formats: Object.entries(EXPORT_FORMATS).map(([id, f]) => ({ id, label: f.label, extension: f.extension })),
      ruleHelp: RULE_HELP,
      liveTest: options.liveTest,
    });
  });

  router.post('/interpret', async (req: Request, res: Response) => {
    const parsed = interpretSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, 'invalid_input', 'That request is not valid.');
    const { templateId, blueprint: opened, text, image, engine: wanted } = parsed.data;

    const finish = (raw: unknown, source: DesignSource, summary: string, notes: string[]) => {
      const checked = validateBlueprint(raw);
      if (!checked.ok) return sendError(res, 422, 'invalid_blueprint', 'The design did not pass validation.', checked.errors);
      return res.json({ ok: true, design: create(checked.blueprint, checked.warnings, source, summary, notes) });
    };

    if (templateId) {
      const template = DESIGN_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return sendError(res, 404, 'not_found', 'Unknown example.');
      return finish(template.build(), { kind: 'example', label: 'Example: built-in design, no AI used' }, `Started from the ${template.title} example`, []);
    }

    if (opened !== undefined) {
      return finish(opened, { kind: 'file', label: 'Opened from a saved Blueprint' }, 'Opened a saved Blueprint', []);
    }

    if (!text && !image) return sendError(res, 400, 'empty_input', 'Draw a sketch, upload an image or describe your idea first.');

    let decoded: { mime: ImageMime; data: Buffer } | undefined;
    if (image) {
      const data = Buffer.from(image.base64, 'base64');
      const mime = sniffImage(data);
      if (!mime) return sendError(res, 400, 'invalid_image', 'The file is not a valid PNG, JPEG or WebP image.');
      if (data.length > MAX_IMAGE_BYTES) return sendError(res, 413, 'too_large', 'Image is larger than 8 MB. Use a smaller photo.');
      decoded = { mime, data };
    }

    if (wanted === 'rules' || !ai.configured) {
      if (!text) return sendError(res, 503, 'not_configured', 'Reading a sketch needs AI (OPENAI_API_KEY). Add a description, or start from an example.');
      try {
        const { blueprint, notes } = interpretWithRules(text);
        const imageNote = decoded ? ['Your sketch was not analysed: only the text was used, with no AI.'] : [];
        return finish(blueprint, { kind: 'rules', label: 'Rule-based: no AI used' }, 'Matched a built-in design from your description', [...imageNote, ...notes]);
      } catch (err) {
        return sendFailure(res, err);
      }
    }

    const result = await withAi(res, () => ai.interpret({ text, image: decoded }));
    if (!result) return undefined;
    return res.json({
      ok: true,
      design: create(result.blueprint, result.warnings, { kind: 'ai', label: `Interpreted by ${result.model}`, model: result.model }, decoded ? 'Interpreted your sketch' : 'Interpreted your description', []),
    });
  });

  router.post('/refine', async (req: Request, res: Response) => {
    const parsed = refineSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, 'invalid_input', 'That request is not valid.');
    const { id, instruction, blueprint: edited, summary, engine: wanted, current: shown } = parsed.data;
    const design = findOrRestore(id, shown);
    if (!design) return sendError(res, 404, 'not_found', 'That design is no longer on the server. It may have restarted; start again.');
    const current = design.versions[design.versions.length - 1].blueprint;

    if (edited !== undefined) {
      const checked = validateBlueprint(edited);
      if (!checked.ok) return sendError(res, 422, 'invalid_blueprint', checked.errors[0], checked.errors);
      return res.json({ ok: true, design: addVersion(design, checked.blueprint, checked.warnings, { kind: 'manual', label: 'Edited by hand' }, summary ?? 'Edited in the inspector', []) });
    }
    if (!instruction) return sendError(res, 400, 'empty_input', 'Describe the change you want.');

    if (wanted === 'rules' || !ai.configured) {
      try {
        const { blueprint, notes } = refineWithRules(current, instruction);
        const checked = validateBlueprint(blueprint);
        if (!checked.ok) return sendError(res, 422, 'invalid_blueprint', `That change doesn't work: ${checked.errors[0]}`, checked.errors);
        return res.json({ ok: true, design: addVersion(design, checked.blueprint, checked.warnings, { kind: 'rules', label: 'Rule-based: no AI used' }, instruction.slice(0, 120), notes) });
      } catch (err) {
        return sendFailure(res, err);
      }
    }

    const result = await withAi(res, () => ai.refine(current, instruction));
    if (!result) return undefined;
    return res.json({
      ok: true,
      design: addVersion(design, result.blueprint, result.warnings, { kind: 'ai', label: `Refined by ${result.model}`, model: result.model }, instruction.slice(0, 120), []),
    });
  });

  router.post('/export', (req: Request, res: Response) => {
    const parsed = exportSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, 'invalid_input', 'That request is not valid.');
    const { id, format, version, current: shown } = parsed.data;
    const design = findOrRestore(id, shown);
    if (!design) return sendError(res, 404, 'not_found', 'That design is no longer on the server. It may have restarted; start again.');
    if (!Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, format)) return sendError(res, 400, 'unknown_format', `Unknown format. Use: ${Object.keys(EXPORT_FORMATS).join(', ')}.`);
    const v = version ? design.versions.find((x) => x.version === version) : design.versions[design.versions.length - 1];
    if (!v) return sendError(res, 404, 'not_found', 'That version is not available.');
    const file = exportDesign(v.blueprint, format as ExportFormat);
    res.set('Content-Type', file.mime);
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    return res.send(file.data);
  });

  router.post('/transcribe', express.raw({ type: ['audio/*', 'video/webm'], limit: MAX_AUDIO_BYTES }), async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return sendError(res, 400, 'empty_audio', 'No audio was received.');
    if (!ai.configured) return sendError(res, 503, 'not_configured', 'Voice input needs an OPENAI_API_KEY on the server.');
    const mime = String(req.headers['content-type'] ?? 'audio/webm').split(';')[0];
    const text = await withAi(res, () => ai.transcribe(req.body as Buffer, mime));
    if (text === null) return undefined;
    return res.json({ ok: true, text, model: ai.transcribeModel });
  });

  router.post('/:id/undo', (req: Request, res: Response) => {
    const design = designs.get(req.params.id);
    if (!design) return sendError(res, 404, 'not_found', 'That design is no longer on the server.');
    if (design.versions.length < 2) return sendError(res, 409, 'nothing_to_undo', 'There is nothing to undo.');
    design.versions.pop();
    return res.json({ ok: true, design: toClient(design) });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const design = designs.get(req.params.id);
    if (!design) return sendError(res, 404, 'not_found', 'That design is not on the server.');
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, design: toClient(design) });
  });

  router.use((_req, res) => sendError(res, 404, 'not_found', 'Not found'));
  return router;
}
