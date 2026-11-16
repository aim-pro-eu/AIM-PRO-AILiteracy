/** Studio paths of the review module, relative to the studio base path. */
export const inboxPath = (contextId: string) => `/contexts/${encodeURIComponent(contextId)}/review`;

export const proposalPath = (contextId: string, proposalId: string) =>
  `${inboxPath(contextId)}/${encodeURIComponent(proposalId)}`;

export const coursePath = (contextId: string) => `/contexts/${encodeURIComponent(contextId)}/course`;

export const buildPath = (contextId: string) => `/contexts/${encodeURIComponent(contextId)}/build`;

export const syllabusEditPath = (contextId: string, proposalId: string) => `${proposalPath(contextId, proposalId)}/edit`;

export const releasePath = (contextId: string, release: { id: string; version: string }) =>
  `/contexts/${encodeURIComponent(contextId)}/releases/${encodeURIComponent(release.id)}/versions/${encodeURIComponent(release.version)}`;

/** The import of an applied release of `authoringId` into the delivery course `contextId` (S10, part 2). */
export const importPath = (contextId: string, authoringId: string, release: { id: string; version: string }) =>
  `/contexts/${encodeURIComponent(contextId)}/import?${new URLSearchParams({ from: authoringId, release: release.id, version: release.version })}`;
