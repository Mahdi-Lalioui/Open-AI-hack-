/**
 * Bean's decision with the Decisions API (one `choice` question).
 *
 * Request/response shape verified against (2026-11-01):
 * - https://developers.openai.com/api/docs/guides/decisions  (POST /v1/decisions, choice questions, input_json)
 * - https://developers.openai.com/api/reference/resources/decisions/methods/create
 *   answers[]: { type: "choice", name, choice, probabilities[], confidence } | { type: "refusal", name }
 * The documented answer has no rationale field, so explanations are built from the facts that were sent.
 */
import type { BeanActionName } from '../../shared/types';
import { type QueueFacts, aiExplanation, offeredActions, truncate } from '../beanRules';
import { OpenAIError, invalidOutputError } from './errors';

export const DECISION_QUESTION_NAME = 'bean_action';

const CHOICE_DESCRIPTIONS: Record<BeanActionName, string> = {
  call_backup: 'Add a second worker now because the line is growing faster than one worker can serve.',
  keep_serving: 'Keep the current staffing; the line is under control or will clear soon.',
};

export function buildDecisionRequest(model: string, facts: QueueFacts) {
  const actions = offeredActions(facts);
  return {
    model,
    input: [
      {
        role: 'developer',
        content:
          'You are Bean, the assistant manager of a small simulated coffee counter in a live demo. ' +
          'Facts come from a queue simulation (all times are simulated seconds). Judge only from the facts given.',
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Current queue facts from the live simulation:' },
          { type: 'input_json', data: { ...facts } },
        ],
      },
    ],
    questions: [
      {
        type: 'choice',
        name: DECISION_QUESTION_NAME,
        instructions:
          `Should the counter call a backup worker to "${facts.serviceLabel}" right now? ` +
          'Prefer call_backup when several people are waiting or the average wait is longer than one service time; ' +
          'otherwise keep_serving.',
        choices: actions.map((value) => ({ value, description: CHOICE_DESCRIPTIONS[value] })),
      },
    ],
  };
}

export interface ParsedDecision {
  action: BeanActionName;
  confidence: number | null;
  explanation: string;
}

/** Validates the answer: it must be a choice from the offered set; anything else is rejected. */
export function parseDecision(response: unknown, facts: QueueFacts): ParsedDecision {
  const answers = (response as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers) || answers.length === 0) throw invalidOutputError('decisions', 'no answers');
  const answer = (answers.find((a) => (a as { name?: unknown })?.name === DECISION_QUESTION_NAME) ?? answers[0]) as Record<
    string,
    unknown
  >;
  if (answer?.type === 'refusal') {
    throw new OpenAIError('model_refused', 'decisions', 'Bean decision: the model declined to answer. Nothing was changed.');
  }
  if (answer?.type !== 'choice') throw invalidOutputError('decisions', 'the answer was not a choice');
  const offered = offeredActions(facts);
  const choice = answer.choice;
  if (typeof choice !== 'string' || !(offered as string[]).includes(choice)) {
    throw invalidOutputError('decisions', 'the choice was not one of the offered actions');
  }
  const action = choice as BeanActionName;
  const confidence =
    typeof answer.confidence === 'number' && answer.confidence >= 0 && answer.confidence <= 1 ? answer.confidence : null;
  // Not part of the documented answer shape; used only if a future response includes it.
  const rationale = typeof answer.rationale === 'string' ? answer.rationale.trim() : '';
  const explanation = rationale ? truncate(rationale) : aiExplanation(action, facts, confidence);
  return { action, confidence, explanation };
}
