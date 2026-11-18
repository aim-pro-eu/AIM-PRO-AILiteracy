import { useSession } from '@alm/auth';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { LearnerApi } from './learnerApi';

interface LearnerServicesValue {
  api: LearnerApi;
  /** A new id for a learner's request (letters, digits and `-`: a `ClientRequestId`). */
  newRequestId: () => string;
}

const LearnerServicesContext = createContext<LearnerServicesValue | null>(null);

export function LearnerServicesProvider({ api, newRequestId, children }: {
  api: LearnerApi; newRequestId?: () => string; children: ReactNode;
}) {
  const value = useMemo(() => ({ api, newRequestId: newRequestId ?? (() => crypto.randomUUID()) }), [api, newRequestId]);
  return <LearnerServicesContext.Provider value={value}>{children}</LearnerServicesContext.Provider>;
}

export function useLearnerServices(): LearnerServicesValue {
  const value = useContext(LearnerServicesContext);
  if (!value) throw new Error('useLearnerServices needs a LearnerServicesProvider');
  return value;
}

/** The CSRF token of the signed-in session; learner pages are shown only inside a signed-in shell. */
export function useCsrfToken(): string {
  const { state } = useSession();
  if (state.status !== 'signed-in') throw new Error('Learner pages need a signed-in session');
  return state.session.csrfToken;
}
