import { openProposals } from '../review/model';
import type { OpenProposal } from '../review/model';
import type { Inbox } from '../review/reviewApi';

/**
 * The learner app's address, with its base path, where a join link leads (S13): set when the studio is built
 * (`http://127.0.0.1:58003/learn` in development), otherwise this site.
 */
const LEARNER_APP_URL: string = import.meta.env.VITE_ALM_LEARNER_APP_URL ?? '';

/** The join link of a course code, as in Teams: the code alone finds the course (D37). */
export function joinLink(code: string, origin = window.location.origin): string {
  return `${(LEARNER_APP_URL || origin).replace(/\/+$/, '')}/join?${new URLSearchParams({ code })}`;
}

/** The opening of the course to students not applied yet: a proposal of a new policy version and its reference. */
export function pendingOpening(inbox: Inbox): OpenProposal | null {
  return openProposals(inbox).find(({ candidates }) => {
    const types = new Set(candidates.map(({ type }) => type));
    return types.size === 2 && types.has('PolicySet') && types.has('ExecutionContext');
  }) ?? null;
}

/** The subject keys typed by a teacher: separated by spaces, commas or new lines. */
export const typedKeys = (text: string) => text.split(/[\s,]+/).filter(Boolean);
