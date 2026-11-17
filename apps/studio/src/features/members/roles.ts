import { openProposals } from '../review/model';
import type { OpenProposal } from '../review/model';
import type { Inbox } from '../review/reviewApi';

/** The catalogue key of each course role (D25); a role the studio does not know keeps its code. */
const ROLE_KEYS = {
  ADMINISTRATOR: 'members.role.ADMINISTRATOR',
  CONTENT_RESPONSIBLE: 'members.role.CONTENT_RESPONSIBLE',
  ASSESSOR: 'members.role.ASSESSOR',
  LEARNER: 'members.role.LEARNER',
  OBSERVER: 'members.role.OBSERVER',
} as const;

export function roleKey(role: string) {
  return Object.hasOwn(ROLE_KEYS, role) ? ROLE_KEYS[role as keyof typeof ROLE_KEYS] : 'members.role.other';
}

/** A membership proposal not applied yet, with who joins and their roles while it awaits a decision (D36, #133). */
export interface PendingMembership extends OpenProposal {
  members: { subject: string; roles: string[] }[] | null;
}

/** The membership proposals of the course not applied yet: each brings participant records (D25). */
export function pendingMemberships(inbox: Inbox): PendingMembership[] {
  return openProposals(inbox).filter(({ candidates }) => candidates.some(({ type }) => type === 'Participant'))
    .map((open) => ({ ...open, members: open.records?.filter(({ type }) => type === 'Participant').map(({ fields }) => ({
      subject: String(fields.subjectKey ?? ''),
      roles: Array.isArray(fields.roles) ? fields.roles.map(String) : [] })) ?? null }));
}
