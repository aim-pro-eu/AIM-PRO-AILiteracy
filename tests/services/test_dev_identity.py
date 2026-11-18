"""The checked-in development realm and identity map agree and hold no secret (S03, D9)."""

import json
from pathlib import Path
import re
import unittest

from services.api_common.identity import load_identity_map


ROOT = Path(__file__).resolve().parents[2]
REALM = ROOT / 'infra/keycloak/alm-dev-realm.json'
IDENTITY_MAP = ROOT / 'infra/keycloak/identity-map.dev.json'
POLICY = ROOT / 'tests/fixtures/alm/trusted-policy.json'
ISSUER = 'http://127.0.0.1:58080/realms/alm-dev'
PLACEHOLDER = re.compile(r'\$\{[A-Z0-9_]+\}')


class DevIdentityTest(unittest.TestCase):
    def setUp(self):
        self.realm = json.loads(REALM.read_text(encoding='utf-8'))
        self.identities = load_identity_map(IDENTITY_MAP)

    def test_mapped_identities_are_realm_users_with_policy_subjects(self):
        users = {user['id']: user['username'] for user in self.realm['users']}
        subjects = json.loads(POLICY.read_text(encoding='utf-8'))['subjects']
        self.assertEqual({(e.issuer, users.get(e.subject), e.subject_key) for e in self.identities.identities},
                         {(ISSUER, 'dev-admin', 'admin'), (ISSUER, 'dev-learner', 'learner'),
                          (ISSUER, 'dev-assessor', 'assessor')})
        # The assessor is in no installed policy: a course administrator adds them as a member (D25, S11).
        self.assertEqual({e.subject_key for e in self.identities.identities} - set(subjects), {'assessor'})
        self.assertIn('dev-unmapped', users.values())

    def test_realm_holds_placeholders_instead_of_secrets(self):
        for client in self.realm['clients']:
            self.assertRegex(client['secret'], PLACEHOLDER)
        for user in self.realm['users']:
            for credential in user['credentials']:
                self.assertRegex(credential['value'], PLACEHOLDER)
        self.assertNotIn('roles', self.realm)

    def test_clients_use_the_code_flow_with_pkce_only(self):
        # The studio's API on 58000 (through the studio's server) and the Learner API on 58002 (S12b browser test).
        clients = {client['clientId']: client for client in self.realm['clients']}
        self.assertEqual({name: client['redirectUris'] for name, client in clients.items()},
                         {'alm-authoring-api': ['http://127.0.0.1:58000/auth/callback'],
                          'alm-learner-api': ['http://127.0.0.1:58002/auth/callback']})
        for client in clients.values():
            self.assertEqual((client['publicClient'], client['standardFlowEnabled'], client['implicitFlowEnabled'],
                              client['directAccessGrantsEnabled'], client['serviceAccountsEnabled']),
                             (False, True, False, False, False))
            self.assertEqual(client['attributes']['pkce.code.challenge.method'], 'S256')


if __name__ == '__main__':
    unittest.main()
