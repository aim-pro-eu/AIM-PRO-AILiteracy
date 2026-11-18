"""Process boundary of the Learner API (S12): no authoring module is importable from it.

A separate interpreter imports the Learner API, builds its app and serves every
endpoint to a signed-in learner of the seed's active delivery, the attempt and
the question included; afterwards no authoring module (the Authoring API, the
authoring, release and membership commands, the generators and their agents,
the job kinds and the job worker, the CLI) and no model client is loaded. The
Learner API's own files import none of them either. It queues a question in the
jobs store (``services.jobs.store``) as the learner request job of
``services.jobs.learner``, which imports no generator.
"""

import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

from tests.authoring_cycle_fixtures import DELIVERY
from tests.services.oidc_fixtures import ISSUER, NO_NETWORK, write_identity_map
from tests.services.test_job_boundaries import MODEL_CLIENTS, imports
from tests.store_backends import block_network
from tests.test_learner_reads import LearnerSeed


ROOT = Path(__file__).resolve().parents[2]
AUTHORING = ('services.authoring_api', 'services.jobs.kinds', 'services.jobs.worker', 'services.jobs.__main__',
             'learning.__main__', 'learning.authoring',
             'learning.projects', 'learning.releases', 'learning.generation', 'learning.membership',
             'learning.evaluation', 'learning.review', 'aimpro', *MODEL_CLIENTS)
PROBE = '''
import json, sys
from services.learner_api.app import create_app, schema_app
import services.learner_api.__main__
schema_app()
roots, served = json.loads(sys.argv[1]), json.loads(sys.argv[2])
statuses = {}
if served:
    from pathlib import Path
    from fastapi.testclient import TestClient
    from services.api_common.settings import ApiSettings
    from tests.services.oidc_fixtures import FakeProvider, auth_settings, log_in
    provider = FakeProvider()
    from services.api_common.auth import CSRF_HEADER
    app = create_app(ApiSettings(auth=auth_settings(), identity_map=Path(served['identities']),
                                 store=served['store'], policy_dir=Path(served['policies']),
                                 jobs_store=served['jobs']),
                     transport=provider.transport)
    client = TestClient(app, base_url='https://testserver', follow_redirects=False)
    log_in(client, provider, served['subject'])
    csrf = {CSRF_HEADER: client.get('/auth/session').json()['csrf_token']}
    statuses = {path: client.post(path, json=body, headers=csrf).status_code for path, body in served['posts']}
    statuses.update({path: client.get(path).status_code for path in served['paths']})
print(json.dumps({'loaded': sorted(m for m in sys.modules if any(m == r or m.startswith(r + '.') for r in roots)),
                  'statuses': statuses}))
'''


def probe(served=None, prefix=''):
    env = {**os.environ, 'LANGFUSE_ENABLED': 'false', 'CREWAI_DISABLE_TELEMETRY': 'true',
           'CREWAI_TRACING_ENABLED': 'false'}
    result = subprocess.run([sys.executable, '-c', prefix + PROBE, json.dumps(AUTHORING), json.dumps(served or {})],
                            cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout.splitlines()[-1])


class LearnerProcessTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)

    def test_serving_every_learner_endpoint_loads_no_authoring_module(self):
        seed = LearnerSeed(self).activate()
        seed.attempts()
        identities = write_identity_map(seed.root, {'issuer': ISSUER, 'subject': 'kc-user-learner',
                                                    'subject_key': 'learner'})
        with seed.contexts.open(DELIVERY) as service:
            activity = next(e.ref for e in service._context(DELIVERY, 'learner').snapshot.active_domain()
                            if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')
        posts = [(f'/courses/{DELIVERY}/attempts', {'request_id': 'attempt-1', 'activity': activity.model_dump(),
                                                     'content': 'Synthetic attempt'}),
                 (f'/courses/{DELIVERY}/questions', {'request_id': 'question-1', 'question': {'text': 'Synthetic'}})]
        paths = ['/courses', f'/courses/{DELIVERY}', f'/courses/{DELIVERY}/progress', f'/courses/{DELIVERY}/questions',
                 f'/courses/{DELIVERY}/questions/question-1']
        result = probe({'identities': str(identities), 'store': str(seed.location),
                        'policies': str(seed.output / seed.manifest.policy_dir), 'subject': 'kc-user-learner',
                        'jobs': str(seed.root / 'jobs.sqlite'), 'posts': posts, 'paths': paths})
        self.assertEqual(result['statuses'], {path: 200 for path in [*(p for p, _ in posts), *paths]})
        self.assertEqual(result['loaded'], [])

    def test_the_probe_detects_an_authoring_module(self):
        self.assertIn('learning.releases', probe(prefix='import learning.releases\n')['loaded'])

    def test_learner_api_files_import_no_authoring_module(self):
        files = sorted((ROOT / 'services' / 'learner_api').glob('*.py'))
        self.assertTrue({'app.py', 'courses.py', 'progress.py', 'attempts.py', 'questions.py', '__main__.py'}
                        <= {p.name for p in files})
        for path in [*files, ROOT / 'services' / 'jobs' / 'learner.py', ROOT / 'services' / 'jobs' / 'store.py']:
            with self.subTest(path.name):
                found = [name for name in imports(path) if any(name == f or name.startswith(f + '.') for f in AUTHORING)]
                self.assertEqual(found, [])


if __name__ == '__main__':
    unittest.main()
