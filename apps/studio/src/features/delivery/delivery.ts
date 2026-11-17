import type { ActivationOutcome, ReleaseInspection } from '../course-build/buildApi';
import { openProposals } from '../review/model';
import type { OpenProposal } from '../review/model';
import type { Entity, EntityRef, Inbox, JsonValue } from '../review/reviewApi';

/**
 * A delivery course (S10, part 2): the import of an applied release, its trusted
 * policy preview and its activation. The release fixes one exact resource for each
 * requirement; the teacher keeps it or leaves the requirement without a resource
 * (owner decision of 16 November 2026, #123). Nothing here installs a policy.
 */

/** The text before the proposed policy in the permissions of an import's PolicySet (`learning/releases.py`). */
export const POLICY_PREVIEW = 'Proposed trusted local policy configuration: ';

const DELIVERY_PREFIX = 'authoring-delivery:';

const text = (value: JsonValue | undefined) => (typeof value === 'string' ? value : '');
const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The new source scope of the import: the course's own name, never one its policy already has. */
export const scopeName = (deliveryId: string) => `${deliveryId}:delivery`;

/** What the teacher chose for one requirement: the resource the release pins, or none. */
export type Choice = 'pinned' | 'none';

export type ReleasedRequirement = ReleaseInspection['requirements'][number];

/** The exact bindings sent: each requirement kept with its pinned resource, in the release's order. */
export function selectedBindings(requirements: ReleasedRequirement[], choices: Choice[]) {
  return requirements.flatMap((requirement, index) => (requirement.resource && choices[index] === 'pinned'
    ? [{ requirement: requirement.requirement, resource: requirement.resource }] : []));
}

/** The proposal of each requirement: its pinned resource when the release pins one. */
export const proposedChoices = (requirements: ReleasedRequirement[]): Choice[] =>
  requirements.map((requirement) => (requirement.resource ? 'pinned' : 'none'));

/** A trusted policy preview as an operator installs it: the exact JSON, and a new file name for the policy directory. */
export interface PolicyPreview {
  file: string;
  json: string;
}

export function policyPreview(policy: { policy_ref: EntityRef }): PolicyPreview {
  const { id, version } = policy.policy_ref;
  return { file: `${id.replaceAll(':', '-')}-${version}.json`, json: JSON.stringify(policy, null, 2) };
}

/** The policy an import's candidates propose, from its PolicySet's permissions, or null. */
export function proposedPolicy(candidates: Entity[]): PolicyPreview | null {
  for (const candidate of candidates.filter((entity) => entity.type === 'PolicySet')) {
    const permissions = Array.isArray(candidate.fields.permissions) ? candidate.fields.permissions : [];
    const entry = permissions.map(text).find((permission) => permission.startsWith(POLICY_PREVIEW));
    if (!entry) continue;
    try {
      const value: unknown = JSON.parse(entry.slice(POLICY_PREVIEW.length));
      if (isObject(value) && isObject(value.policy_ref)) return policyPreview(value as unknown as { policy_ref: EntityRef });
    } catch {
      // Not a preview the studio can read: the exact payload stays in the technical details.
    }
  }
  return null;
}

/** Whether the context holds an applied delivery import, which only activation changes further. */
export function isImportedDelivery(context: Entity): boolean {
  const models = Array.isArray(context.fields.models) ? context.fields.models : [];
  return models.some((model) => isObject(model) && text(model.id).startsWith(DELIVERY_PREFIX));
}

/**
 * The activation proposal of the course that is not applied yet and was made on the course as it is now, or null
 * (#133). An activation proposes the course record alone, in LEARNING/ACTIVE; one made on an earlier version is
 * refused as stale when applied, so another may be proposed.
 */
export function pendingActivation(inbox: Inbox): OpenProposal | null {
  return openProposals(inbox).find(({ candidates, records, current }) => current && candidates.length === 1
    && candidates[0]!.type === 'ExecutionContext' && candidates[0]!.id === inbox.context.id
    && (records === null || records.some(({ fields }) => fields.mode === 'LEARNING' && fields.status === 'ACTIVE')))
    ?? null;
}

/** One reason activation is refused, in words: its reason, what to do and its code. */
export type Refusal = { message: 'delivery.activation.other'; values: { reason: string; resolution: string; code: string } };

/** The findings of a refused activation, in words. */
export function refusals(findings: ActivationOutcome['findings']): Refusal[] {
  return findings.map((finding) => ({ message: 'delivery.activation.other',
    values: { reason: finding.reason, resolution: finding.resolution, code: finding.code } }));
}
