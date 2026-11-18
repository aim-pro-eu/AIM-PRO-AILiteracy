"""The checked-in OpenAPI snapshot is the API contract; ``--check`` fails on drift (S03)."""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest

from services.api_common.openapi import SNAPSHOT_DIR, main, snapshots, write_snapshots
from tests.services.oidc_fixtures import NO_NETWORK
from tests.store_backends import block_network


class OpenApiSnapshotTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)

    def run_main(self, *args):
        output = StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            try:
                main(list(args))
            except SystemExit as exit:
                return exit.code or 0, output.getvalue()
        return 0, output.getvalue()

    def test_checked_in_snapshot_matches_the_app(self):
        self.assertEqual(self.run_main('--check'), (0, ''))
        self.assertEqual(sorted(p.name for p in SNAPSHOT_DIR.glob('*.json')), ['authoring.json', 'learner.json'])

    def schema(self, name='authoring.json'):
        return json.loads((SNAPSHOT_DIR / name).read_text(encoding='utf-8'))

    def test_snapshot_lists_the_skeleton_read_only_authoring_review_job_course_export_source_and_syllabus_endpoints(self):
        schema = self.schema()
        self.assertEqual(schema['info']['title'], 'ALM Authoring API')
        resource = '/contexts/{context_id}/resources/{resource_id}/versions/{version}'
        job = '/contexts/{context_id}/jobs/{request_id}'
        self.assertEqual({path: sorted(methods) for path, methods in schema['paths'].items()},
                         {'/health': ['get'], '/auth/login': ['get'], '/auth/callback': ['get'],
                          '/auth/session': ['get'], '/auth/logout': ['post'],
                          '/contexts': ['get'],
                          '/contexts/{context_id}': ['get'], '/contexts/{context_id}/pending-proposals': ['get'],
                          '/contexts/{context_id}/proposals/{proposal_id}': ['get'],
                          '/contexts/{context_id}/decisions': ['post'], '/contexts/{context_id}/applications': ['post'],
                          '/contexts/{context_id}/projects/{project_id}': ['get'],
                          '/contexts/{context_id}/projects': ['post'],
                          '/contexts/{context_id}/completion-rules': ['post'], '/contexts/{context_id}/releases': ['post'],
                          '/contexts/{context_id}/delivery-imports': ['post'],
                          '/contexts/{context_id}/activations': ['post'],
                          '/contexts/{context_id}/members': ['get', 'post'],
                          '/contexts/{context_id}/learners': ['post'],
                          '/contexts/{context_id}/enrolment': ['get', 'post'],
                          '/contexts/{context_id}/enrolment/code': ['delete', 'post'],
                          '/contexts/{context_id}/designs/{design_id}/versions/{version}/syllabus': ['get'],
                          resource + '/project-syllabus': ['get'], resource + '/release': ['get'],
                          '/contexts/{context_id}/jobs': ['get', 'post'], job: ['get'], job + '/events': ['get'],
                          job + '/abandonment': ['post'], job + '/choice': ['post'], '/courses': ['post'],
                          '/contexts/{context_id}/aimpro-exports': ['post'],
                          '/contexts/{context_id}/aimpro-exports/{sha256}/targets': ['get'],
                          '/contexts/{context_id}/source-discoveries/{request_id}': ['get'],
                          '/contexts/{context_id}/source-preparations/{request_id}': ['get'],
                          '/contexts/{context_id}/syllabus-proposals/{proposal_id}': ['get'],
                          '/contexts/{context_id}/syllabus-edits': ['post'],
                          '/contexts/{context_id}/syllabus-reviews/{request_id}': ['get'],
                          '/contexts/{context_id}/generation-reviews/{request_id}': ['get']})

    def test_an_export_upload_is_the_raw_file(self):
        upload = self.schema()['paths']['/contexts/{context_id}/aimpro-exports']['post']
        self.assertEqual(upload['requestBody'], {'required': True, 'content': {
            'application/octet-stream': {'schema': {'type': 'string', 'format': 'binary'}}}})
        self.assertEqual(sorted(p['name'] for p in upload['parameters']),
                         ['competencies', 'context_id', 'root_id', 'scenario'])

    def test_job_progress_is_a_server_sent_event_stream_of_status_and_progress(self):
        schema = self.schema()
        stream = schema['paths']['/contexts/{context_id}/jobs/{request_id}/events']['get']['responses']['200']
        self.assertEqual(list(stream['content']), ['text/event-stream'])
        commands = schema['components']['schemas']['JobRequest']['properties']['job']
        self.assertEqual(sorted(commands['discriminator']['mapping']),
                         ['discover-aimpro-syllabus-sources', 'generate-aimpro-syllabus', 'generate-project-assessments',
                          'generate-project-teacher', 'generate-project-trainer', 'prepare-aimpro-syllabus-sources',
                          'propose-evaluation', 'revise-aimpro-syllabus'])
        self.assertEqual(schema['components']['schemas']['JobView']['properties']['status']['enum'],
                         ['QUEUED', 'RUNNING', 'PROPOSED', 'REJECTED', 'FAILED', 'ABANDONED', 'COMPLETED',
                          'AWAITING_CHOICE', 'ACCEPTED', 'DECLINED'])

    def test_the_learner_snapshot_lists_the_skeleton_and_the_learner_endpoints_only(self):
        schema = self.schema('learner.json')
        self.assertEqual(schema['info']['title'], 'ALM Learner API')
        self.assertEqual({path: sorted(methods) for path, methods in schema['paths'].items()},
                         {'/health': ['get'], '/auth/login': ['get'], '/auth/callback': ['get'],
                          '/auth/session': ['get'], '/auth/logout': ['post'], '/courses': ['get'],
                          '/courses/{context_id}': ['get'], '/courses/{context_id}/progress': ['get'],
                          '/courses/{context_id}/attempts': ['post'], '/courses/{context_id}/questions': ['get', 'post'],
                          '/courses/{context_id}/questions/{request_id}': ['get'],
                          '/enrolments': ['post']})
        self.assertEqual(schema['components']['schemas']['Question']['properties']['intent']['enum'],
                         ['EXPLAIN', 'SOCRATIC_GUIDANCE'])

    def test_no_learner_schema_has_an_answer_key_a_proposal_or_a_decision(self):
        def properties(value):
            if isinstance(value, dict):
                yield from value.get('properties', {})
                for item in value.values():
                    yield from properties(item)
            elif isinstance(value, list):
                for item in value:
                    yield from properties(item)
        names = {name.lower() for name in properties(self.schema('learner.json')['components'])}
        self.assertIn('rubric', names)
        self.assertEqual({name for name in names if 'answer' in name or 'proposal' in name or 'decision' in name
                          or 'participant' in name}, set())

    def test_every_error_response_documents_the_error_body(self):
        for name in ('authoring.json', 'learner.json'):
            schema = self.schema(name)
            self.assertNotIn('HTTPValidationError', schema['components']['schemas'])
            self.assertNotIn('ValidationError', schema['components']['schemas'])
            self.assertEqual(set(schema['components']['schemas']['ErrorBody']['required']), {'error', 'detail', 'request_id'})
            for path, methods in schema['paths'].items():
                for method, operation in methods.items():
                    errors = {status: response for status, response in operation['responses'].items() if int(status) >= 400}
                    with self.subTest(f'{name}: {method.upper()} {path}'):
                        self.assertIn('500', errors)
                        for response in errors.values():
                            self.assertEqual(response['content']['application/json']['schema'],
                                             {'$ref': '#/components/schemas/ErrorBody'})
                        if path.startswith(('/contexts/', '/courses/')):
                            self.assertEqual(sorted(errors), ['401', '403', '404', '409', '422', '500'])
                        if path.startswith('/auth/') and path != '/auth/login':
                            self.assertIn('401', errors)

    def test_rendering_is_deterministic(self):
        self.assertEqual(snapshots(), snapshots())
        for text in snapshots().values():
            self.assertTrue(text.endswith('}\n'))

    def test_check_fails_on_drift_missing_or_extra_snapshots(self):
        changes = {
            'changed': lambda d: (d / 'authoring.json').write_text(
                (d / 'authoring.json').read_text(encoding='utf-8').replace('ALM Authoring API', 'Other'), encoding='utf-8'),
            'reformatted': lambda d: (d / 'authoring.json').write_text(
                json.dumps(json.loads((d / 'authoring.json').read_text(encoding='utf-8'))), encoding='utf-8'),
            'missing': lambda d: (d / 'learner.json').unlink(),
            'extra': lambda d: (d / 'other.json').write_text('{}\n', encoding='utf-8'),
        }
        for name, change in changes.items():
            with self.subTest(name), TemporaryDirectory() as tmp:
                directory = Path(tmp) / 'openapi'
                shutil.copytree(SNAPSHOT_DIR, directory)
                self.assertEqual(self.run_main('--check', '--output', str(directory))[0], 0)
                change(directory)
                status, output = self.run_main('--check', '--output', str(directory))
                self.assertEqual(status, 1)
                self.assertIn('OpenAPI snapshots differ', output)

    def test_write_then_check(self):
        with TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'openapi'
            self.assertEqual(self.run_main('--output', str(directory)), (0, ''))
            self.assertEqual(self.run_main('--check', '--output', str(directory)), (0, ''))
            for name in ('authoring.json', 'learner.json'):
                self.assertEqual((directory / name).read_text(encoding='utf-8'),
                                 (SNAPSHOT_DIR / name).read_text(encoding='utf-8'))
            (directory / 'stale.json').write_text('{}\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                write_snapshots(directory)


if __name__ == '__main__':
    unittest.main()
