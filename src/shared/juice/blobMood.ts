// What the blob's resting mood is right now. It is never sad or sick: the worst it gets is sleepy.
// No React, so it can be tested.
import { sleepPlan } from '../../app/lib/downtime';
import type { SurveyAnswers } from '../../app/lib/survey';

export type BlobMood = 'idle' | 'happy' | 'cheer' | 'boop' | 'yawn' | 'sleep' | 'dizzy';

const DAY = 24 * 60;

// Asleep between the bedtime and wake time from the survey (wrapping past midnight).
export function isSleepTime(minutes: number, survey: Partial<SurveyAnswers> | null | undefined) {
  const { bedtime, wake } = sleepPlan(survey);
  const bed = bedtime % DAY;
  const m = ((minutes % DAY) + DAY) % DAY;
  return bed > wake ? m >= bed || m < wake : m >= bed && m < wake;
}

// The mood it settles back into when nothing is happening.
export function restingMood(minutes: number, survey: Partial<SurveyAnswers> | null | undefined, path: string): BlobMood {
  if (isSleepTime(minutes, survey)) return 'sleep';
  if (path.startsWith('/reflection')) return 'yawn';
  return 'idle';
}
