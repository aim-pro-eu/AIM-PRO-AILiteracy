"""Process boundary of the Learner API (S12): no authoring module is importable from it.

A separate interpreter imports the Learner API, builds its app and serves every
endpoint to a signed-in learner of the seed's active delivery; afterwards no
authoring module (the Authoring API, the authoring, release and membership
commands, the generators and their agents, the job worker, the CLI) and no
model client is loaded. The Learner API's own files import none of them either.
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
AUTHORING = ('services.authoring_api', 'services.jobs', 'learning.__main__', 'learning.authoring',
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
    app = create_app(ApiSettings(auth=auth_settings(), identity_map=Path(served['identities']),
                                 store=served['store'], policy_dir=Path(served['policies'])),
                     transport=provider.transport)
    client = TestClient(app, base_url='https://testserver', follow_redirects=False)
    log_in(client, provider, served['subject'])
    statuses = {path: client.get(path).status_code for path in served['paths']}
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
        paths = ['/courses', f'/courses/{DELIVERY}', f'/courses/{DELIVERY}/progress']
        result = probe({'identities': str(identities), 'store': str(seed.location),
                        'policies': str(seed.output / seed.manifest.policy_dir), 'subject': 'kc-user-learner',
                        'paths': paths})
        self.assertEqual(result['statuses'], {path: 200 for path in paths})
        self.assertEqual(result['loaded'], [])

    def test_the_probe_detects_an_authoring_module(self):
        self.assertIn('learning.releases', probe(prefix='import learning.releases\n')['loaded'])

    def test_learner_api_files_import_no_authoring_module(self):
        files = sorted((ROOT / 'services' / 'learner_api').glob('*.py'))
        self.assertTrue({'app.py', 'courses.py', 'progress.py', '__main__.py'} <= {p.name for p in files})
        for path in files:
            with self.subTest(path.name):
                found = [name for name in imports(path) if any(name == f or name.startswith(f + '.') for f in AUTHORING)]
                self.assertEqual(found, [])


if __name__ == '__main__':
    unittest.main()
