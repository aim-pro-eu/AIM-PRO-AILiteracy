import type { Activity, CourseNode, CourseView, LearnerFailure } from '../courses/learnerApi';

/** A code of the course (an intent, a format) in words, when the catalogue has none. */
export function readable(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim();
  const lower = words === words.toUpperCase() ? words.toLowerCase() : words;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export const INTENTS = ['EXPLAIN', 'PRACTICE', 'ASSESS'] as const;
export const isIntent = (code: string): code is (typeof INTENTS)[number] => (INTENTS as readonly string[]).includes(code);

/** Only a web address becomes a link; any other locator is shown as text. */
export const isWebAddress = (value: string) => /^https?:\/\//i.test(value);

export const assessmentAnchor = (id: string) => `assessment-${id}`;

/** Names of the course's records by id, for the references of activities and assessments. */
export interface Names {
  outcomes: Map<string, string>;
  competences: Map<string, string>;
  strategies: Map<string, string>;
  materials: Map<string, string>;
  activities: Map<string, string>;
}

export function activitiesOf(node: CourseNode): Activity[] {
  return [...node.activities, ...node.children.flatMap(activitiesOf)];
}

export function namesOf(course: CourseView): Names {
  const byId = <T,>(items: readonly T[], id: (item: T) => string, name: (item: T) => string) =>
    new Map(items.map((item) => [id(item), name(item)]));
  return {
    outcomes: byId(course.outcomes, (o) => o.ref.id, (o) => o.statement),
    competences: byId(course.competences, (c) => c.ref.id, (c) => c.name),
    strategies: byId(course.strategies, (s) => s.ref.id, (s) => s.name),
    materials: byId(course.materials, (m) => m.ref.id, (m) => m.title),
    activities: byId(activitiesOf(course.structure), (a) => a.ref.id, (a) => a.instruction),
  };
}

export const named = (names: Map<string, string>, refs: readonly { id: string }[]) =>
  refs.map((ref) => names.get(ref.id) ?? ref.id).join(', ');

/** The activity with this id and the phase or unit that holds it (the course itself for a top-level activity). */
export function findActivity(course: CourseView, activityId: string): { activity: Activity; node: CourseNode } | null {
  const search = (node: CourseNode): { activity: Activity; node: CourseNode } | null => {
    const activity = node.activities.find((candidate) => candidate.ref.id === activityId);
    if (activity) return { activity, node };
    for (const child of node.children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(course.structure);
}

/** Why a course, or a learner's records in it, cannot be shown: a catalogue key per failure. */
export const FAILURES: Record<LearnerFailure, 'course.unavailable' | 'course.notOpen' | 'course.notLearner' | 'course.failed'> = {
  'not-found': 'course.unavailable',
  'not-open': 'course.notOpen',
  forbidden: 'course.notLearner',
  conflict: 'course.failed',
  'signed-out': 'course.failed',
  failed: 'course.failed',
};
