/** Bean's mood line for text UI. Uses the plain-text helper until the scene exports beanMood(). */
import type { PublicState } from '../../shared/types';
import { simpleBeanMood, type BeanMoodText } from '../lib/format';

export function getBeanMood(state: PublicState): BeanMoodText {
  return simpleBeanMood(state);
}
