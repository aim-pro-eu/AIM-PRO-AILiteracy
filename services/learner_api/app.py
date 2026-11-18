"""Learner API app: the shared skeleton plus the learner modules selected by configuration (S12, S12b).

A separate process from the Authoring API: it imports no authoring module, and
every route reads the learner's courses and the learner's own records only, or
writes the learner's own attempt or question (S12 part 2) or joins a course with
its code (S12b). A question is queued in the jobs store for the job worker; this
process builds no agent.
"""

from __future__ import annotations

import httpx
from fastapi import FastAPI

from services.api_common.app import create_app as build_app
from services.api_common.auth import Authenticator, CookieNames
from services.api_common.contexts import ContextServices, PolicyDirectory
from services.api_common.identity import IdentityMap, load_identity_map
from services.api_common.registry import ConfigurationError, ModuleRegistry
from services.api_common.settings import ApiSettings, AuthSettings
from services.learner_api import attempts, courses, enrolments, progress, questions


TITLE = 'ALM Learner API'
VERSION = '0.3.0'
REGISTRY = ModuleRegistry((courses.MODULE, progress.MODULE, attempts.MODULE, questions.MODULE, enrolments.MODULE))
# The learner app and the studio may share a host name (127.0.0.1 in development): cookies of its own (S13).
COOKIES = CookieNames(session='alm_learner_session', login='alm_learner_login')


def create_app(settings: ApiSettings | None = None, *, transport: httpx.BaseTransport | None = None) -> FastAPI:
    settings = settings or ApiSettings.from_env()
    modules = REGISTRY.select(settings.modules)
    contexts = None
    if modules:
        if settings.store is None or settings.policy_dir is None:
            raise ConfigurationError('Learner modules need ALM_STORE and ALM_POLICY_DIR')
        contexts = ContextServices(settings.store.get_secret_value(), PolicyDirectory(settings.policy_dir))
    if questions.MODULE in modules and settings.jobs_store is None:
        raise ConfigurationError('The questions module needs ALM_JOBS_STORE')
    if enrolments.MODULE in modules and settings.enrolment_secret is None:
        raise ConfigurationError('The enrolments module needs ALM_ENROLMENT_SECRET')
    authenticator = Authenticator(settings.auth, load_identity_map(settings.identity_map), transport=transport,
                                  cookies=COOKIES)
    app = build_app(TITLE, VERSION, modules, authenticator)
    app.state.contexts = contexts
    questions.configure(app, settings)
    enrolments.configure(app, settings)
    return app


def schema_app() -> FastAPI:
    """Every registered module with placeholder settings: the contract, not a deployment."""
    settings = AuthSettings(issuer='https://identity.invalid', client_id='schema', client_secret='unused',
                            redirect_uri='https://api.invalid/auth/callback')
    return build_app(TITLE, VERSION, REGISTRY.select(None),
                     Authenticator(settings, IdentityMap(format=1, identities=()), cookies=COOKIES))
