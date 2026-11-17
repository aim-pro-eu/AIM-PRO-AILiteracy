import type { Entity, EntityRef, Inbox, JsonValue } from '../review/reviewApi';

/**
 * The attempts an assessor evaluates (S11): what students submitted at the course's
 * assessments. The runtime assessor drafts an evaluation of one attempt on request;
 * a person reads, decides and applies it in the review inbox.
 */

const text = (value: JsonValue | undefined) => (typeof value === 'string' ? value : '');
const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const refKey = (value: JsonValue | undefined) =>
  (isObject(value) ? `${text(value.type)}\u0000${text(value.id)}\u0000${text(value.version)}` : '');

/** One submitted attempt at an assessment: its exact evidence, the assessment, the student, the response. */
export interface Attempt {
  evidence: EntityRef;
  /** The first line of the assessment's instruction. */
  activity: string;
  learner: string;
  observedAt: string;
  response: string;
  /** The modes of the evaluations of this attempt already applied. */
  evaluated: string[];
}

/** Whether the subject takes part in the context as an assessor (S11). */
export function assesses(inbox: Inbox, subjectKey: string) {
  return inbox.entities.some(({ type, fields }) => type === 'Participant' && fields.subjectKey === subjectKey
    && Array.isArray(fields.roles) && fields.roles.includes('ASSESSOR'));
}

/** The observed attempts at ASSESS activities among the course's records, oldest first. */
export function assessedAttempts(entities: Entity[]): Attempt[] {
  const byRef = new Map(entities.map((entity) => [`${entity.type}\u0000${entity.id}\u0000${entity.version}`, entity]));
  const evaluations = entities.filter((entity) => entity.type === 'Evaluation');
  return entities.filter((entity) => entity.type === 'LearningEvidence')
    .map((evidence) => ({ evidence, activity: byRef.get(refKey(evidence.fields.activity)) }))
    .filter(({ activity }) => activity?.fields.intent === 'ASSESS')
    .map(({ evidence, activity }) => {
      const key = `${evidence.type}\u0000${evidence.id}\u0000${evidence.version}`;
      return {
        evidence: { type: evidence.type, id: evidence.id, version: evidence.version },
        activity: text(activity?.fields.instruction).split('\n')[0] ?? '',
        learner: text(byRef.get(refKey(evidence.fields.learner))?.fields.subjectKey),
        observedAt: text(evidence.fields.observedAt),
        response: text(evidence.fields.contentOrLocator),
        evaluated: evaluations.filter(({ fields }) => Array.isArray(fields.evidence)
          && fields.evidence.some((item) => refKey(item) === key)).map(({ fields }) => text(fields.mode)),
      };
    })
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}
