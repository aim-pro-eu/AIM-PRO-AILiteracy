import type { Entity, EntityRef, Inbox, JsonValue } from './reviewApi';

/**
 * A proposal explanation: a sentence, optionally followed by one JSON object of
 * diagnostics, as the generators write `proposedChange`. Anything else stays text.
 */
export interface Explanation {
  summary: string;
  details: Record<string, JsonValue> | null;
}

export function parseExplanation(text: string): Explanation {
  const start = text.indexOf('{');
  if (start >= 0) {
    try {
      const details: unknown = JSON.parse(text.slice(start));
      if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
        return { summary: text.slice(0, start).trim(), details: details as Record<string, JsonValue> };
      }
    } catch {
      // Not a trailing object: the whole text is the summary.
    }
  }
  return { summary: text, details: null };
}

export type Change =
  | { path: string; kind: 'added'; after: JsonValue }
  | { path: string; kind: 'removed'; before: JsonValue }
  | { path: string; kind: 'changed'; before: JsonValue; after: JsonValue };

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const join = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

/** Leaf-level differences between two JSON values, in path order (object keys sorted). */
export function diffValues(before: JsonValue, after: JsonValue, path = ''): Change[] {
  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: Change[] = [];
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      changes.push(...diffEntry(before, after, index, join(path, index)));
    }
    return changes;
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => diffEntry(before, after, key, join(path, key)));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, kind: 'changed', before, after }];
}

function diffEntry(before: JsonValue[] | Record<string, JsonValue>, after: JsonValue[] | Record<string, JsonValue>,
  key: string | number, path: string): Change[] {
  const had = Object.hasOwn(before, key);
  const has = Object.hasOwn(after, key);
  const old = (before as Record<string | number, JsonValue>)[key] as JsonValue;
  const value = (after as Record<string | number, JsonValue>)[key] as JsonValue;
  if (had && has) return diffValues(old, value, path);
  return had ? [{ path, kind: 'removed', before: old }] : [{ path, kind: 'added', after: value }];
}

export interface CandidateComparison {
  candidate: Entity;
  /** The applied record with the same type and id, if the context has one. */
  applied: Entity | null;
  status: 'new' | 'changed' | 'unchanged';
  /** Differences of `fields` against the applied record; every field for a new record. */
  changes: Change[];
}

/** Compare each candidate with the currently applied version of the same artefact. */
export function compareCandidates(candidates: Entity[], applied: Entity[]): CandidateComparison[] {
  const byRecord = new Map(applied.map((entity) => [`${entity.type}\u0000${entity.id}`, entity]));
  return candidates.map((candidate) => {
    const current = byRecord.get(`${candidate.type}\u0000${candidate.id}`) ?? null;
    const changes = diffValues(current?.fields ?? {}, candidate.fields);
    const status = current === null ? 'new' : changes.length > 0 ? 'changed' : 'unchanged';
    return { candidate, applied: current, status, changes };
  });
}

/**
 * The latest revision of each change proposal of a context summary. The summary lists the store's latest revisions
 * after the records the context reaches, which may hold an older one: an applied evaluation reaches, through its
 * decision, the revision that was decided (S11). The later revision of an id wins.
 */
export function latestProposals(entities: Entity[]): Entity[] {
  const latest = new Map<string, Entity>();
  for (const entity of entities) if (entity.type === 'ChangeProposal') latest.set(entity.id, entity);
  return [...latest.values()];
}

export const proposalStatus = (proposal: Entity) => String(proposal.fields.status ?? '');

/** A proposal of the course not applied yet: it awaits a decision or, approved, its application (S11b, #133). */
export interface OpenProposal {
  proposal: Entity;
  /** The types and ids of the records it proposes. */
  candidates: EntityRef[];
  /** The records it proposes, for a proposal awaiting a decision (they come with the inbox); null once approved. */
  records: Entity[] | null;
  /**
   * Whether it was made on the course as it is now. Applying any proposal gives the course a new version, and the
   * core refuses a proposal made on an earlier one as stale: it is proposed again. Students joining or added, and
   * their attempts, leave the course version as it was (D37, S12b); an evaluation draft no longer applies once its
   * student attempted the same assessment again (D38).
   */
  current: boolean;
}

const refs = (value: JsonValue | undefined): EntityRef[] => (Array.isArray(value) ? value : [])
  .filter((item): item is Record<string, JsonValue> => isObject(item))
  .map((item) => ({ type: String(item.type ?? ''), id: String(item.id ?? ''), version: String(item.version ?? '') }));

/** The causes of the changes that leave the course version: a student joining or added, a student's attempt. */
const LEARNER_CAUSES = ['Participant', 'LearningEvidence'];

/**
 * The causes of the changes since the version `base`, newest first, when each is a learner's event (a join, an
 * attempt), as the core checks it (`learning/decisions.py`); otherwise null: the course itself changed.
 */
function learnerEvents(inbox: Inbox, base: string): EntityRef[] | null {
  const changes = new Map(inbox.entities.filter(({ type }) => type === 'StateChange')
    .map((change) => [String(change.fields.newVersion ?? ''), change]));
  const events: EntityRef[] = [];
  let version = inbox.context.version;
  while (version !== base) {
    const change = changes.get(version);
    changes.delete(version);
    const [cause] = refs(change ? [change.fields.cause ?? null] : []);
    if (!change || !cause || !LEARNER_CAUSES.includes(cause.type)) return null;
    events.push(cause);
    version = String(change.fields.baseVersion ?? '');
  }
  return events;
}

/** What an evaluation draft can still do: be applied, or not since its student attempted again or the course changed. */
export type DraftState = 'current' | 'attemptedAgain' | 'courseChanged';

/**
 * The state of an evaluation draft made on the course at its base version (D38): another student's attempt, or the
 * student's attempt at another activity, leaves it current; the student's new attempt at the same assessment does
 * not, nor any applied proposal. Students and activities are compared by id, as the core does.
 */
export function evaluationDraftState(inbox: Inbox, proposal: Entity, candidates: Entity[]): DraftState {
  const events = learnerEvents(inbox, String(proposal.fields.baseContextVersion ?? ''));
  if (events === null) return 'courseChanged';
  const evidence = new Map(inbox.entities.filter(({ type }) => type === 'LearningEvidence').map((item) => [item.id, item]));
  const key = (item: Entity | undefined) => {
    const [learner] = refs(item ? [item.fields.learner ?? null] : []);
    const [activity] = refs(item ? [item.fields.activity ?? null] : []);
    return learner && activity ? `${learner.id}\u0000${activity.id}` : null;
  };
  const judged = new Set(candidates.filter(({ type }) => type === 'Evaluation')
    .flatMap(({ fields }) => refs(fields.evidence)).map(({ id }) => key(evidence.get(id))));
  judged.delete(null);
  return events.some(({ type, id }) => type === 'LearningEvidence' && judged.has(key(evidence.get(id))))
    ? 'attemptedAgain' : 'current';
}

/** The proposals of the course that await a decision or, approved, their application; those awaiting a decision first. */
export function openProposals(inbox: Inbox): OpenProposal[] {
  const records = new Map(inbox.pending.map((pending) => [pending.proposal.id, pending.candidates]));
  const open = latestProposals(inbox.entities).filter((proposal) => ['AWAITING_DECISION', 'APPROVED']
    .includes(proposalStatus(proposal)));
  return [...inbox.pending.map((pending) => pending.proposal), ...open.filter((proposal) => !records.has(proposal.id))]
    .map((proposal) => {
      const candidates = refs(proposal.fields.candidateDefinitions);
      const found = records.get(proposal.id) ?? null;
      // An approved evaluation draft comes without its records: only a change of the course is seen for it.
      const current = candidates.some(({ type }) => type === 'Evaluation')
        ? evaluationDraftState(inbox, proposal, found ?? []) === 'current'
        : learnerEvents(inbox, String(proposal.fields.baseContextVersion ?? '')) !== null;
      return { proposal, candidates, records: found, current };
    });
}

export const proposalExplanation = (proposal: Entity) => parseExplanation(String(proposal.fields.proposedChange ?? ''));

/** A short name of a record for people: its name or title when it has one, otherwise its id. */
export function recordLabel(entity: Entity): string {
  const { name, title } = entity.fields;
  return typeof name === 'string' && name ? name : typeof title === 'string' && title ? title : entity.id;
}

/**
 * A code or key in words: `contract_findings` → `Contract findings`,
 * `CRITERIA_BASED_PRODUCT` → `Criteria based product`. Codes are data, not catalogue strings.
 */
export function readable(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim();
  const lower = words === words.toUpperCase() ? words.toLowerCase() : words;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export const refOf = ({ type, id, version }: Entity) => ({ type, id, version });
