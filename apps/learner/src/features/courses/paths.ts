/** Addresses inside the learner app, relative to its base path. */
export const JOIN_PATH = '/join';

export const coursePath = (contextId: string) => `/courses/${encodeURIComponent(contextId)}`;
