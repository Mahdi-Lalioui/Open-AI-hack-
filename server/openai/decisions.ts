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

// ---------------------------------------------------------------------------
// Pet decision ("Ask the pet") — same documented request/response shape.
// ---------------------------------------------------------------------------
import type { PetActionName } from '../../shared/creations';
import { type PetFacts, aiPetExplanation, allowedPetActions } from '../beanRules';

export const PET_QUESTION_NAME = 'pet_action';
const PET_DESCRIPTIONS: Record<PetActionName, string> = {
  eat: 'Eat a snack because it is hungry.',
  sleep: 'Take a nap because its energy is low.',
  play: 'Play with a toy.',
  dance: 'Do a happy dance.',
  wave: 'Wave hello at the guests.',
  idle: 'Do nothing.',
};

export function buildPetDecisionRequest(model: string, facts: PetFacts) {
  return {
    model,
    input: [
      {
        role: 'developer',
        content:
          'You are the mind of a small virtual pet in a live demo. Needs are 0..100 (hunger: higher = hungrier). ' +
          'Guest interactions are recent counts. Judge only from the facts given.',
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Current pet needs and recent guest interactions:' },
          { type: 'input_json', data: { ...facts } },
        ],
      },
    ],
    questions: [
      {
        type: 'choice',
        name: PET_QUESTION_NAME,
        instructions: `What should ${facts.name} do next to stay happy and healthy, given its needs and what the guests did?`,
        choices: allowedPetActions(facts).map((value) => ({ value, description: PET_DESCRIPTIONS[value] })),
      },
    ],
  };
}

export function parsePetDecision(response: unknown, facts: PetFacts): { action: PetActionName; confidence: number | null; explanation: string } {
  const answers = (response as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers) || answers.length === 0) throw invalidOutputError('decisions', 'no answers');
  const answer = (answers.find((a) => (a as { name?: unknown })?.name === PET_QUESTION_NAME) ?? answers[0]) as Record<string, unknown>;
  if (answer?.type === 'refusal') {
    throw new OpenAIError('model_refused', 'decisions', 'Pet decision: the model declined to answer. Nothing was changed.');
  }
  if (answer?.type !== 'choice') throw invalidOutputError('decisions', 'the answer was not a choice');
  const allowed = allowedPetActions(facts) as string[];
  if (typeof answer.choice !== 'string' || !allowed.includes(answer.choice)) {
    throw invalidOutputError('decisions', 'the choice was not one of the allowed actions');
  }
  const action = answer.choice as PetActionName;
  const confidence = typeof answer.confidence === 'number' && answer.confidence >= 0 && answer.confidence <= 1 ? answer.confidence : null;
  return { action, confidence, explanation: aiPetExplanation(action, facts, confidence) };
}
