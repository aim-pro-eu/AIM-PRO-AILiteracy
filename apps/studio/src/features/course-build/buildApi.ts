import type { AuthoringClient, components } from '@alm/api-client';

import { ReviewError } from '../review/reviewApi';
import type { EntityRef, ReviewFailure } from '../review/reviewApi';

type Schemas = components['schemas'];

export type CourseView = Schemas['CourseView'];
export type CourseEntry = Schemas['ContextEntry'];
export type ExportReport = Schemas['ExportReport'];
export type JobView = Schemas['JobView'];
export type JobStatus = JobView['status'];
export type ProjectProposal = Schemas['ProjectProposal'];
export type ProjectInspection = Schemas['ProjectInspection'];
export type ReleaseProposal = Schemas['ReleaseProposal'];
export type ReleaseInspection = Schemas['ReleaseInspection'];
export type ImportProposal = Schemas['ImportProposal'];
export type MemberList = Schemas['MemberList'];
export type MemberRole = Schemas['NewMember']['role'];
export type MembershipProposal = Schemas['MembershipProposal'];
export type EnrolmentView = Schemas['EnrolmentView'];
export type EnrolmentProposal = Schemas['EnrolmentProposal'];
export type ActivationOutcome = Schemas['ActivationOutcome'];
export type SourceDiscovery = Schemas['SourceDiscoveryView'];
export type SourcePreparation = Schemas['SourcePreparationView'];
export type SourcePlan = Schemas['SourcePlan'];
export type ExportTargets = Schemas['ExportTargets'];
export type CoverageRequirement = Schemas['CoverageRequirement'];
export type AimproExport = ExportReport['export'];
export type SyllabusReviews = Schemas['SyllabusReviews'];
export type SyllabusAttempt = SyllabusReviews['attempts'][number];
export type GenerationReviews = Schemas['GenerationReviews'];
export type GenerationAttempt = GenerationReviews['attempts'][number];

/** The statuses after which a job never changes again. */
export const FINAL_STATUSES: readonly JobStatus[] = [
  'PROPOSED', 'REJECTED', 'FAILED', 'ABANDONED', 'COMPLETED', 'ACCEPTED', 'DECLINED',
];
/** The statuses after which the worker is done with a job: final, or awaiting the teacher's choice. */
export const ENDED_STATUSES: readonly JobStatus[] = [...FINAL_STATUSES, 'AWAITING_CHOICE'];

export const DISCOVERY = 'discover-aimpro-syllabus-sources';
export const PREPARATION = 'prepare-aimpro-syllabus-sources';
export const CURATOR = 'generate-aimpro-syllabus';
export const REVISION = 'revise-aimpro-syllabus';
/** The runtime assessor's job: a draft evaluation of one observed attempt (S11). */
export const EVALUATION = 'propose-evaluation';
export type EvaluationMode = 'FORMATIVE' | 'FORMAL';
/** The Evaluator, Teacher and Trainer job kinds, whose drafts the review agent judges (S09c). */
export const GENERATORS: readonly string[] = [
  'generate-project-assessments', 'generate-project-teacher', 'generate-project-trainer',
];

export type GeneratorKind = 'generate-project-assessments' | 'generate-project-teacher' | 'generate-project-trainer';

/** What an Evaluator, Teacher or Trainer job receives: exact refs, and the author's requirements. */
export interface GeneratorCommand {
  project: EntityRef;
  baseContext: EntityRef;
  /** The applied assessments the Teacher and Trainer build on; none for the Evaluator. */
  assessments: EntityRef[];
  requirements: string[];
}

/** The Curator grounded by a search query, or by prepared sources that the teacher accepted. */
export type CuratorCommand = {
  export: AimproExport;
  scenario: string;
  competencies: string;
  sourceScope: string;
} & ({ query: string } | { preparedSources: string });

export interface PreparationCommand {
  export: AimproExport;
  scenario: string;
  competencies: string;
  plan: SourcePlan;
}

/** The steps that start a course: create it, upload its AIM-PRO model, draft its syllabus, initialize its project. */
export interface BuildApi {
  /** A new course: a new context and policy for the signed-in creator; the same id again returns the same course. */
  createCourse(csrfToken: string, contextId: string): Promise<CourseView>;
  /** The courses the signed-in subject may read, by id, with the subject's roles in each. */
  listCourses(): Promise<CourseEntry[]>;
  /** Check the file and store it unchanged; a refused file is a `refused` error whose detail names the reason. */
  uploadExport(contextId: string, csrfToken: string, file: Blob, scenario: string, competencies: string): Promise<ExportReport>;
  /** Queue the Curator on an uploaded export; the same request id returns the same job. */
  queueCurator(contextId: string, csrfToken: string, requestId: string, command: CuratorCommand): Promise<JobView>;
  /** Queue the Curator's revision of a syllabus proposal on which the teacher requested a revision. */
  queueRevision(contextId: string, csrfToken: string, requestId: string, proposalId: string): Promise<JobView>;
  readJob(contextId: string, requestId: string): Promise<JobView>;
  /** The jobs of the course, newest first. */
  listJobs(contextId: string): Promise<JobView[]>;
  /** Queue a search of the course's sources; nothing is selected or used yet. */
  queueDiscovery(contextId: string, csrfToken: string, requestId: string,
    command: { sourceScope: string; queries: { query: string; k: number }[] }): Promise<JobView>;
  readDiscovery(contextId: string, requestId: string): Promise<SourceDiscovery>;
  /** Queue the preparation of the excerpts a teacher picked; it then awaits the teacher's choice. */
  queuePreparation(contextId: string, csrfToken: string, requestId: string, command: PreparationCommand): Promise<JobView>;
  readPreparation(contextId: string, requestId: string): Promise<SourcePreparation>;
  /** How the review agent judged each draft of an ended Curator job, first to last. */
  readSyllabusReviews(contextId: string, requestId: string): Promise<SyllabusReviews>;
  /** How the review agent judged each draft of an ended Evaluator, Teacher or Trainer job, first to last. */
  readGenerationReviews(contextId: string, requestId: string): Promise<GenerationReviews>;
  /** Accept or decline prepared sources; only accepted sources ground a Curator job. */
  chooseSources(contextId: string, csrfToken: string, requestId: string, choice: 'ACCEPTED' | 'DECLINED'): Promise<JobView>;
  /** The learning targets and practices of an uploaded export, for coverage requirements. */
  exportTargets(contextId: string, exported: AimproExport, scenario: string, competencies: string): Promise<ExportTargets>;
  /** The exact approved syllabus of the course's current outline. */
  approvedSyllabus(contextId: string, design: EntityRef): Promise<EntityRef>;
  /** Propose a project from that syllabus; the same request id replays the same proposal. */
  initializeProject(contextId: string, csrfToken: string, command: {
    requestId: string; projectId: string; syllabus: EntityRef; baseContext: EntityRef;
  }): Promise<ProjectProposal>;
  /** The project's current selections, their approval receipts and stale dependencies. */
  inspectProject(contextId: string, projectId: string): Promise<ProjectInspection>;
  /** Queue the Evaluator, Teacher or Trainer; a base that is no longer current is a `conflict`. */
  queueGenerator(contextId: string, csrfToken: string, requestId: string, kind: GeneratorKind,
    command: GeneratorCommand): Promise<JobView>;
  /** Propose the fixed completion rule on every part of the project's design; the same request id replays. */
  proposeCompletionRules(contextId: string, csrfToken: string, command: {
    requestId: string; project: EntityRef; baseContext: EntityRef;
  }): Promise<ProjectProposal>;
  /** Propose a frozen release of the project's exact current selection; the same request id replays. */
  proposeRelease(contextId: string, csrfToken: string, command: {
    requestId: string; project: EntityRef; domain: EntityRef; baseContext: EntityRef;
  }): Promise<ReleaseProposal>;
  /** An applied release: its approvals, the exact records it freezes, its findings and what an import binds. */
  inspectRelease(contextId: string, release: EntityRef): Promise<ReleaseInspection>;
  /** Propose importing an applied release into this new delivery course; the same request id replays. */
  proposeImport(contextId: string, csrfToken: string, command: ImportCommand): Promise<ImportProposal>;
  /** Propose activating an applied import: a proposal, or the findings that refuse it (nothing is recorded then). */
  proposeActivation(contextId: string, csrfToken: string, command: {
    requestId: string; baseContext: EntityRef;
  }): Promise<ActivationOutcome>;
  /** The course's members, the mapped people who may still join and the roles; for its administrators (D25). */
  members(contextId: string): Promise<MemberList>;
  /** Propose new members: one new policy version and a participant each, to review; the same request id replays. */
  proposeMembership(contextId: string, csrfToken: string, command: {
    requestId: string; baseContext: EntityRef; members: { subject: string; role: MemberRole }[];
  }): Promise<MembershipProposal>;
  /** Whether the course is open to students and its current code; for its administrators (D37). */
  enrolment(contextId: string): Promise<EnrolmentView>;
  /** Propose opening the course to students: its learner grant in a new policy version, to review. */
  proposeEnrolment(contextId: string, csrfToken: string, command: {
    requestId: string; baseContext: EntityRef;
  }): Promise<EnrolmentProposal>;
  /** Create or reset the code of an open course, at once; the previous code stops working. */
  resetEnrolmentCode(contextId: string, csrfToken: string): Promise<EnrolmentView>;
  /** Disable the code, at once; the students stay. */
  disableEnrolmentCode(contextId: string, csrfToken: string): Promise<EnrolmentView>;
  /** Add students at once, under the learner grant, with no proposal (D37); the members after it. */
  addLearners(contextId: string, csrfToken: string, command: { requestId: string; subjects: string[] }): Promise<MemberList>;
  /** Ask the runtime assessor for a draft evaluation of one observed attempt; the same request id returns the same job. */
  queueEvaluation(contextId: string, csrfToken: string, requestId: string, command: {
    evidence: EntityRef; mode: EvaluationMode;
  }): Promise<JobView>;
}

/** What a delivery import sends: the release, its course, the exact resource of each bound requirement, the handlers. */
export interface ImportCommand {
  requestId: string;
  release: EntityRef;
  authoringContext: string;
  baseContext: EntityRef;
  scopeName: string;
  bindings: { requirement: EntityRef; resource: EntityRef }[];
  completionRules: EntityRef[];
}

const REASONS: Record<number, ReviewFailure> = {
  401: 'signed-out', 403: 'forbidden', 404: 'unavailable', 409: 'conflict', 422: 'refused',
};

type Answer<T> = { data?: T; error?: Schemas['ErrorBody']; response: Response };

async function settle<T>(call: () => Promise<Answer<T>>): Promise<T> {
  let answer;
  try {
    answer = await call();
  } catch {
    throw new ReviewError('failed', null);
  }
  const { data, error, response } = answer;
  if (data !== undefined && response.ok) return data;
  const detail = typeof error?.detail === 'string' ? error.detail : null;
  throw new ReviewError(REASONS[response.status] ?? 'failed', response.status, detail);
}

export function createBuildApi(client: AuthoringClient): BuildApi {
  const writing = (csrfToken: string) => ({ 'X-CSRF-Token': csrfToken });
  return {
    async createCourse(csrfToken, contextId) {
      return settle(() => client.POST('/courses', { headers: writing(csrfToken), body: { context_id: contextId } }));
    },

    async listCourses() {
      const listed = await settle(() => client.GET('/contexts'));
      return listed.contexts;
    },

    async uploadExport(contextId, csrfToken, file, scenario, competencies) {
      return settle(() => client.POST('/contexts/{context_id}/aimpro-exports', {
        params: { path: { context_id: contextId }, query: { scenario, competencies } },
        headers: { ...writing(csrfToken), 'Content-Type': 'application/octet-stream' },
        // The file goes as it is: the API stores these exact bytes.
        body: file as unknown as string,
        bodySerializer: (body: unknown) => body as Blob,
      }));
    },

    async queueCurator(contextId, csrfToken, requestId, command) {
      const grounding = 'query' in command ? { query: command.query } : { prepared_sources: command.preparedSources };
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: {
          request_id: requestId,
          job: {
            kind: CURATOR, project: command.export, source_scope: command.sourceScope, ...grounding, k: 5,
            scenario: command.scenario, competencies: command.competencies,
          },
        },
      }));
    },

    async queueRevision(contextId, csrfToken, requestId, proposalId) {
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, job: { kind: REVISION, proposal: proposalId } },
      }));
    },

    async readJob(contextId, requestId) {
      return settle(() => client.GET('/contexts/{context_id}/jobs/{request_id}', {
        params: { path: { context_id: contextId, request_id: requestId } },
      }));
    },

    async listJobs(contextId) {
      const listed = await settle(() => client.GET('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
      }));
      return listed.jobs;
    },

    async queueDiscovery(contextId, csrfToken, requestId, { sourceScope, queries }) {
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, job: {
          kind: DISCOVERY,
          discovery: { format: 'aimpro-source-discovery', format_version: 1, source_scope: sourceScope, queries },
        } },
      }));
    },

    async readDiscovery(contextId, requestId) {
      return settle(() => client.GET('/contexts/{context_id}/source-discoveries/{request_id}', {
        params: { path: { context_id: contextId, request_id: requestId } },
      }));
    },

    async queuePreparation(contextId, csrfToken, requestId, command) {
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: {
          request_id: requestId,
          job: { kind: PREPARATION, project: command.export, plan: command.plan, scenario: command.scenario,
            competencies: command.competencies },
        },
      }));
    },

    async readPreparation(contextId, requestId) {
      return settle(() => client.GET('/contexts/{context_id}/source-preparations/{request_id}', {
        params: { path: { context_id: contextId, request_id: requestId } },
      }));
    },

    async readSyllabusReviews(contextId, requestId) {
      return settle(() => client.GET('/contexts/{context_id}/syllabus-reviews/{request_id}', {
        params: { path: { context_id: contextId, request_id: requestId } },
      }));
    },

    async readGenerationReviews(contextId, requestId) {
      return settle(() => client.GET('/contexts/{context_id}/generation-reviews/{request_id}', {
        params: { path: { context_id: contextId, request_id: requestId } },
      }));
    },

    async chooseSources(contextId, csrfToken, requestId, choice) {
      return settle(() => client.POST('/contexts/{context_id}/jobs/{request_id}/choice', {
        params: { path: { context_id: contextId, request_id: requestId } },
        headers: writing(csrfToken),
        body: { choice },
      }));
    },

    async exportTargets(contextId, exported, scenario, competencies) {
      return settle(() => client.GET('/contexts/{context_id}/aimpro-exports/{sha256}/targets', {
        params: { path: { context_id: contextId, sha256: exported.sha256 }, query: { scenario, competencies } },
      }));
    },

    async approvedSyllabus(contextId, design) {
      const approved = await settle(() => client.GET('/contexts/{context_id}/designs/{design_id}/versions/{version}/syllabus', {
        params: { path: { context_id: contextId, design_id: design.id, version: design.version } },
      }));
      return approved.syllabus;
    },

    async initializeProject(contextId, csrfToken, { requestId, projectId, syllabus, baseContext }) {
      return settle(() => client.POST('/contexts/{context_id}/projects', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, project_id: projectId, syllabus, base_context: baseContext },
      }));
    },

    async inspectProject(contextId, projectId) {
      return settle(() => client.GET('/contexts/{context_id}/projects/{project_id}', {
        params: { path: { context_id: contextId, project_id: projectId } },
      }));
    },

    async queueGenerator(contextId, csrfToken, requestId, kind, { project, baseContext, assessments, requirements }) {
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, job: { kind, command: {
          project, base_context: baseContext, assessments, requirements, shared_content: [], stimulus_requirements: [],
        } } },
      }));
    },

    async proposeCompletionRules(contextId, csrfToken, { requestId, project, baseContext }) {
      return settle(() => client.POST('/contexts/{context_id}/completion-rules', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, project, base_context: baseContext },
      }));
    },

    async proposeRelease(contextId, csrfToken, { requestId, project, domain, baseContext }) {
      return settle(() => client.POST('/contexts/{context_id}/releases', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, project, domain, base_context: baseContext },
      }));
    },

    async inspectRelease(contextId, release) {
      return settle(() => client.GET('/contexts/{context_id}/resources/{resource_id}/versions/{version}/release', {
        params: { path: { context_id: contextId, resource_id: release.id, version: release.version } },
      }));
    },

    async proposeImport(contextId, csrfToken, command) {
      return settle(() => client.POST('/contexts/{context_id}/delivery-imports', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: {
          request_id: command.requestId, release: command.release, authoring_context: command.authoringContext,
          base_context: command.baseContext, scope_name: command.scopeName,
          bindings: command.bindings.map(({ requirement, resource }) => ({
            requirement, resource, usage_scope: command.scopeName })),
          // The fixed completion rule of each part (S09c2) completes when all its activities are completed.
          completion_handlers: command.completionRules.map((rule) => ({ rule, handler: 'all_completed' as const })),
        },
      }));
    },

    async proposeActivation(contextId, csrfToken, { requestId, baseContext }) {
      return settle(() => client.POST('/contexts/{context_id}/activations', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, base_context: baseContext },
      }));
    },

    async members(contextId) {
      return settle(() => client.GET('/contexts/{context_id}/members', { params: { path: { context_id: contextId } } }));
    },

    async proposeMembership(contextId, csrfToken, { requestId, baseContext, members }) {
      return settle(() => client.POST('/contexts/{context_id}/members', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, base_context: baseContext, members },
      }));
    },

    async enrolment(contextId) {
      return settle(() => client.GET('/contexts/{context_id}/enrolment', { params: { path: { context_id: contextId } } }));
    },

    async proposeEnrolment(contextId, csrfToken, { requestId, baseContext }) {
      return settle(() => client.POST('/contexts/{context_id}/enrolment', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, base_context: baseContext },
      }));
    },

    async resetEnrolmentCode(contextId, csrfToken) {
      return settle(() => client.POST('/contexts/{context_id}/enrolment/code', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
      }));
    },

    async disableEnrolmentCode(contextId, csrfToken) {
      return settle(() => client.DELETE('/contexts/{context_id}/enrolment/code', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
      }));
    },

    async addLearners(contextId, csrfToken, { requestId, subjects }) {
      return settle(() => client.POST('/contexts/{context_id}/learners', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, subjects },
      }));
    },

    async queueEvaluation(contextId, csrfToken, requestId, { evidence, mode }) {
      return settle(() => client.POST('/contexts/{context_id}/jobs', {
        params: { path: { context_id: contextId } },
        headers: writing(csrfToken),
        body: { request_id: requestId, job: { kind: EVALUATION, command: { evidence, mode } } },
      }));
    },
  };
}
