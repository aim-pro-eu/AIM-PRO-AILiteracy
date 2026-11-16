import type { ReleaseInspection } from '../course-build/buildApi';
import type { Entity, JsonValue } from '../review/reviewApi';

/**
 * An applied release as a teacher checks it (`show-release`, S10): who approved each
 * part, the exact records it freezes, and the findings that stand in the way of
 * delivering it. Titles and kinds come from the course's records (the latest
 * revision of each id); the versions are the release's own.
 */
export interface ReleaseReport {
  /** The release, its project and each part it freezes, with the proposal that approved it or null. */
  approvals: { part: 'release' | 'project' | 'artifact'; kind: string; title: string; proposal: string | null }[];
  /** The frozen records by type, in the order of the closure. */
  frozen: { type: string; records: { id: string; version: string; title: string }[] }[];
  findings: { code: string; target: string; reason: string; resolution: string }[];
}

const text = (value: JsonValue | undefined) => (typeof value === 'string' ? value : '');

function parsed(entity: Entity | undefined): Record<string, JsonValue> | null {
  const content = text(entity?.fields.contentOrLocator);
  if (!content.trimStart().startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(content);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, JsonValue> : null;
  } catch {
    return null;
  }
}

export function releaseReport(inspection: ReleaseInspection, entities: Entity[]): ReleaseReport {
  const byId = new Map(entities.map((entity) => [`${entity.type}\u0000${entity.id}`, entity]));
  const get = (ref: { type: string; id: string }) => byId.get(`${ref.type}\u0000${ref.id}`);
  const title = (ref: { type: string; id: string }) =>
    text(get(ref)?.fields.title) || text(get(ref)?.fields.name) || ref.id;
  const project = parsed(get(inspection.manifest.project));
  const kinds = new Map<string, string>();
  for (const artifact of Array.isArray(project?.artifacts) ? project.artifacts : []) {
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) continue;
    const resource = artifact.resource;
    if (typeof resource === 'object' && resource !== null && !Array.isArray(resource)) {
      kinds.set(text(resource.id), text(artifact.kind));
    }
  }
  const frozen: ReleaseReport['frozen'] = [];
  for (const ref of inspection.closure) {
    let group = frozen.find((item) => item.type === ref.type);
    if (!group) frozen.push(group = { type: ref.type, records: [] });
    group.records.push({ id: ref.id, version: ref.version, title: title(ref) });
  }
  return {
    approvals: [
      { part: 'release', kind: '', title: title(inspection.release), proposal: inspection.receipt?.proposal.id ?? null },
      { part: 'project', kind: '', title: title(inspection.manifest.project),
        proposal: inspection.project_receipt?.proposal.id ?? null },
      ...inspection.artifacts.map(({ resource, receipt }) => ({
        part: 'artifact' as const, kind: kinds.get(resource.id) ?? '', title: title(resource),
        proposal: receipt?.proposal.id ?? null })),
    ],
    frozen,
    findings: inspection.findings.map((finding) => ({
      code: finding.code, target: finding.target, reason: finding.reason, resolution: finding.resolution })),
  };
}
