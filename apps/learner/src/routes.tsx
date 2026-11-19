import type { RouteObject } from 'react-router';

import { CoursePage } from './features/course/CoursePage';
import { MyCoursesPage } from './features/courses/MyCoursesPage';
import { JoinPage } from './features/join/JoinPage';
import { PracticePage } from './features/practice/PracticePage';
import { ProgressPage } from './features/progress/ProgressPage';
import { LearnerShell } from './shell/LearnerShell';
import { NotFoundPage } from './shell/NotFoundPage';

export { LEARNER_BASENAME } from './base';

/** Each feature adds its routes here. */
export const learnerRoutes: RouteObject[] = [
  {
    path: '/',
    element: <LearnerShell />,
    children: [
      { index: true, element: <MyCoursesPage /> },
      { path: 'join', element: <JoinPage /> },
      { path: 'courses/:contextId', element: <CoursePage /> },
      { path: 'courses/:contextId/activities/:activityId', element: <PracticePage /> },
      { path: 'courses/:contextId/progress', element: <ProgressPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
