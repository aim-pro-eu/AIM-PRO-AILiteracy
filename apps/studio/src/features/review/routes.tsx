import type { RouteObject } from 'react-router';
import { useParams, useSearchParams } from 'react-router';

import { BuildPage } from '../course-build/BuildPage';
import { CoursePage } from '../course/CoursePage';
import { ImportPage } from '../delivery/ImportPage';
import { MembersPage } from '../members/MembersPage';
import { ReleasePage } from '../release/ReleasePage';
import { ProposalPage } from './ProposalPage';
import { ReviewInboxPage } from './ReviewInboxPage';
import { SyllabusEditPage } from './SyllabusEditPage';

// A new context or proposal is a new page: its state never carries over (key).
function InboxRoute() {
  const { contextId = '' } = useParams();
  return <ReviewInboxPage key={contextId} contextId={contextId} />;
}

function CourseRoute() {
  const { contextId = '' } = useParams();
  return <CoursePage key={contextId} contextId={contextId} />;
}

function BuildRoute() {
  const { contextId = '' } = useParams();
  return <BuildPage key={contextId} contextId={contextId} />;
}

function MembersRoute() {
  const { contextId = '' } = useParams();
  return <MembersPage key={contextId} contextId={contextId} />;
}

function ProposalRoute() {
  const { contextId = '', proposalId = '' } = useParams();
  return <ProposalPage key={`${contextId}/${proposalId}`} contextId={contextId} proposalId={proposalId} />;
}

function SyllabusEditRoute() {
  const { contextId = '', proposalId = '' } = useParams();
  return <SyllabusEditPage key={`${contextId}/${proposalId}`} contextId={contextId} proposalId={proposalId} />;
}

function ReleaseRoute() {
  const { contextId = '', releaseId = '', version = '' } = useParams();
  return <ReleasePage key={`${contextId}/${releaseId}/${version}`} contextId={contextId}
    release={{ type: 'Resource', id: releaseId, version }} />;
}

function ImportRoute() {
  const { contextId = '' } = useParams();
  const [search] = useSearchParams();
  const authoringId = search.get('from') ?? '';
  const release = { type: 'Resource', id: search.get('release') ?? '', version: search.get('version') ?? '' };
  return <ImportPage key={`${contextId}/${authoringId}/${release.id}/${release.version}`} contextId={contextId}
    authoringId={authoringId} release={release} />;
}

export const reviewRoutes: RouteObject[] = [
  { path: 'contexts/:contextId/course', element: <CourseRoute /> },
  { path: 'contexts/:contextId/build', element: <BuildRoute /> },
  { path: 'contexts/:contextId/review', element: <InboxRoute /> },
  { path: 'contexts/:contextId/review/:proposalId', element: <ProposalRoute /> },
  { path: 'contexts/:contextId/review/:proposalId/edit', element: <SyllabusEditRoute /> },
  { path: 'contexts/:contextId/releases/:releaseId/versions/:version', element: <ReleaseRoute /> },
  { path: 'contexts/:contextId/import', element: <ImportRoute /> },
  { path: 'contexts/:contextId/members', element: <MembersRoute /> },
];
