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
