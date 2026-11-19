/** Addresses inside the learner app, relative to its base path. */
export const JOIN_PATH = '/join';

export const coursePath = (contextId: string) => `/courses/${encodeURIComponent(contextId)}`;

/** The practice page of one activity of the course (S13 part 2). */
export const practicePath = (contextId: string, activityId: string) =>
  `${coursePath(contextId)}/activities/${encodeURIComponent(activityId)}`;

export const progressPath = (contextId: string) => `${coursePath(contextId)}/progress`;
