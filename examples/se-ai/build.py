"""Build the SE-AI case-study course as an AIM-PRO megamodel from the unchanged 4 November 2026 metamodels.

A small Software Engineering course with AI literacy support, sized for a full studio test in about an hour:
4 modules, 8 learning targets (one syllabus unit each), 16 activities, 10 competencies. The source export is
read, never written; every object here is new, with its own id.

    .venv/bin/python examples/se-ai/build.py

writes ``SE-AI.megamodel.json`` and ``validation.json`` next to this file. Upload the megamodel in the studio with
scenario ``SE_AI_iSQD`` and competencies ``SE_AI_Competencies``.
"""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from aimpro.audit import audit_project, objects  # noqa: E402
from aimpro.validation import validate_scenario  # noqa: E402
from course_data import AI_COMPETENCIES, FAMILIES, MODULES, SE_COMPETENCIES  # noqa: E402

OUT = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/resources/aimpro-megamodel-2026-11-04.json'
STAMP = '2026-11-17T12:00:00.000Z'
SCENARIO = 'SE_AI_iSQD'
CATALOG = 'SE_AI_Competencies'
# The 4 November catalogue's vocabulary in upper case, mapped to the declared enumeration values.
VOCABULARY = {'category': {'DIGITAL': 'Digital'}, 'ksa': {'SKILL': 'Skill'}, 'proficiency': {'FOUNDATION': 'Foundational'},
              'heRelevance': {'HIGH': 'High'}, 'smeRelevance': {'HIGH': 'High'}, 'vetRelevance': {'HIGH': 'High'}}


def uid(label):
    return 'Pointer_SEAI_' + hashlib.sha256(label.encode()).hexdigest()[:20]


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def main():
    source = json.loads(SOURCE.read_text())
    needed = {'Competencies', 'Resources', 'iSQD', 'Certification Design', 'Activities'}
    metamodels = [deepcopy(m) for m in source['definitions']['metamodels'] if m['metadata']['name'] in needed]
    mm = {m['metadata']['name']: m for m in metamodels}

    def descriptor(name):
        return dict(id=mm[name]['metadata']['id'], name=name, nsURI='')

    def obj(package, cls, label, attrs=None, refs=None, children=None):
        result = dict(id=uid(label), **{'class': dict(name=cls, package=package, metamodel=descriptor(package))}, name=label)
        if attrs:
            result['attributes'] = attrs
        if refs:
            result['references'] = {k: [{'$ref': v['id']} for v in values] for k, values in refs.items()}
        if children:
            result['children'] = children
        return result

    def model(name, metamodel, owned):
        return dict(format='jjodel-model', formatVersion='1.0',
                    metadata=dict(name=name, id=uid(name), exportedAt=STAMP, jjodelVersion='v2.23'),
                    metamodel=dict(**descriptor(metamodel), packages=deepcopy(mm[metamodel]['packages'])),
                    objects=owned, externalObjects=[], externalMetamodels=[])

    # Competencies: the selected AI literacy ones copied with new ids, plus the local SE outcomes.
    competencies, mapping = {}, []
    catalogue = next(m for m in source['definitions']['models'] if m['metadata']['name'] == 'elena_usecase_competencies')
    for original in objects(catalogue['objects']):
        code = original.get('attributes', {}).get('ID')
        if code not in AI_COMPETENCIES:
            continue
        attrs, changes = deepcopy(original['attributes']), []
        for field, replacements in VOCABULARY.items():
            if attrs.get(field) in replacements:
                changes.append(dict(field=field, before=attrs[field], after=replacements[attrs[field]]))
                attrs[field] = replacements[attrs[field]]
        if not isinstance(attrs['sourceFrameworks'], list):
            changes.append(dict(field='sourceFrameworks', before=attrs['sourceFrameworks'], after=[attrs['sourceFrameworks']]))
            attrs['sourceFrameworks'] = [attrs['sourceFrameworks']]
        competencies[code] = obj('Competencies', 'Competency', 'COMP_' + code, attrs)
        mapping.append(dict(code=code, source_object_id=original['id'], generated_object_id=competencies[code]['id'],
                            changes=changes))
    for code, title, description, proficiency in SE_COMPETENCIES:
        competencies[code] = obj('Competencies', 'Competency', 'COMP_' + code, dict(
            ID=code, title=title, description=description, category='Digital', ksa='Skill', proficiency=proficiency,
            heRelevance='High', smeRelevance='High', vetRelevance='High',
            sourceFrameworks=['Locally authored SE-AI case-study outcome; not an official external framework mapping']))

    resources = []

    def resource(key, title, markdown, codes):
        item = obj('Resources', 'GeneratedOER', 'RES_' + key, dict(
            ID=key, title=title, description=title, markdown=markdown, resourceType='Document',
            proficiency='Intermediate', isSelfContained=True,
            dublin_core=json.dumps(dict(language='en', creator='SE-AI case-study authoring proposal',
                                        type='Authored teaching material'))),
            refs=dict(tags=[competencies[c] for c in sorted(set(codes))]))
        resources.append(item)
        return item

    policy = resource('AI_POLICY', 'AI use and responsible delivery policy', """# Course AI agreement

A proposed teaching policy; the instructor sets the local rules before delivery.

1. Start every task with your own interpretation, design or failing test; then you may ask an assistant for gaps, counterexamples or a review.
2. Use synthetic data only: no real names, e-mail addresses, credentials or private repositories in a prompt.
3. Before accepting a suggestion, inspect it, run the relevant tests and record accept, modify or reject with the reason.
4. Distinguish a command you ran, with its observed output, from a claim an assistant made.
5. Attribute reused code and generated text; check the licence before redistribution.
6. Working without AI is always possible: a peer or the instructor provides the same critique.
7. AI feedback is advisory. The instructor assesses the actual work; no generated response establishes competence.
""", ['SE05', 'D08', 'D16', 'R27'])
    project = resource('PROJECT', 'TaskBoard project brief', """# TaskBoard

Teams of two build TaskBoard, a small task-sharing service for a study group, with synthetic data only. A member creates a task with a title,
an owner and a deadline; shares it with other members; marks it done; and receives a reminder the day before the deadline. The service has an
HTTP or command-line interface of the team's choice, an in-memory store and automated tests. Four milestones follow the modules: requirements
(M1), design (M2), verified deadline reminders (M3) and a reviewed, documented release (M4). Every milestone includes an AI-use note: what was
asked, what was accepted, modified or rejected, and the evidence for the decision.
""", [c[0] for c in SE_COMPETENCIES] + list(AI_COMPETENCIES))

    targets, clusters, items, rubrics, crosswalk = [], [], [], {}, []
    for index, m in enumerate(MODULES):
        key, codes = m['key'], m['se'] + m['ai']
        rubric = dict(key='RUBRIC_' + key, status='DRAFT', scale=[0, 1, 2, 3], criteria=[
            dict(key='artefact', weight=40, descriptors=[
                'The artefact is missing or contradicts the request.', 'The artefact covers the main case but misses a stated check.',
                'The artefact satisfies these checks: ' + m['checks'], 'All checks are met and an extra adversarial case is handled.']),
            dict(key='reasoning', weight=30, descriptors=[
                'The choices cannot be explained.', 'Choices are named but not justified against an alternative.',
                'The objective is met and a choice is justified: ' + m['objective'], 'An alternative is compared with concrete evidence.']),
            dict(key='judgment', weight=30, descriptors=[
                'An AI or peer suggestion is accepted without inspection.', 'A suggestion is recorded but the decision lacks evidence.',
                'The AI-use note answers: ' + m['decision'], 'The note also states the remaining uncertainty and a no-AI check.']),
        ])
        rubrics[key] = rubric
        rubric_resource = resource('RUBRIC_' + key, key + ' formative rubric',
                                   '# ' + key + ' rubric\n\n```json\n' + json.dumps(rubric, indent=2) + '\n```', codes)
        brief = resource('BRIEF_' + key, key + ': ' + m['title'], f"""# {key}: {m['title']}

## Outcome
{m['objective']}

## Case
{m['case']}

## Task
{m['work']}

## Checks
{m['checks']}

## Weak suggestion to challenge
{m['weak']}

## Submission
{m['artifact']}. Answer individually: {m['decision']}
""", codes)
        module_targets = []
        for family in m['targets']:
            strategy_cls, primary_cls, secondary_cls, focus = FAMILIES[family]
            label = key + '_' + family
            first, second = {
                'F': ('The instructor presents the case: ' + m['case'] + ' Students predict what goes wrong before any AI use.',
                      'Students annotate the weak suggestion: ' + m['weak'] + ' They name the unsupported claim.'),
                'C': ('Pairs carry out the task: ' + m['work'] + ' They agree on the goal first and attribute every AI-assisted change.',
                      'Pairs ask an assistant one bounded question about their draft and challenge its answer with a counterexample; '
                      'a peer critique is the no-AI route.'),
                'R': ('Each student evaluates the artefact and any AI or peer suggestion against: ' + m['checks'],
                      'Each student writes a short decision record answering: ' + m['decision']),
                'A': ('Each student applies the skill to TaskBoard and submits: ' + m['artifact'] + '.',
                      'Each student gives a three-minute teach-back on the actual result and answers a peer question without AI.'),
            }[family]
            activities = [obj('iSQD', primary_cls, label + '_activity_1', dict(
                              inPractice=first, rationale='Make the reasoning and the evidence observable for: ' + m['objective'])),
                          obj('iSQD', secondary_cls, label + '_activity_2', dict(
                              inPractice=second, rationale='Require a learner-owned explanation; generated text alone is no evidence.'))]
            strategy = obj('iSQD', strategy_cls, label + '_strategy', children=dict(activities=activities))
            target = obj('iSQD', 'LearningTarget', label + '_target',
                         dict(description=m['objective'] + ' ' + focus,
                              contextDetails=f"Week {index + 1}; {m['title']}. Two ordered targets per module; 3 contact hours and "
                                             f"4 independent hours for the module. Evidence: {m['artifact']}."),
                         refs=dict(competency=[competencies[c] for c in codes],
                                   resources=[brief, rubric_resource, policy, project]),
                         children=dict(strategy=[strategy]))
            targets.append(target)
            module_targets.append(target)
        prerequisites = [obj('Certification Design', 'Prerequisite', key + '_prerequisite', dict(
            ID=key + '_PRE', title='Previous module evidence', status='Draft', version='1.0.0', type='Recommended Sequence'),
            refs=dict(target=[clusters[-1]]))] if clusters else []
        cluster = obj('Certification Design', 'CompetencyCluster', key + '_cluster', dict(
            ID=key, title=m['title'], description=m['objective'], status='Draft', version='1.0.0', primaryKSA='Skill',
            proficiency='Foundational' if index == 0 else 'Intermediate',
            contextPriority='Core HE software engineering module; module evidence does not certify a whole external competency',
            evidenceTypes=['RUBRIC_MICROTASK', 'TOOL_TRACE', 'REFLECTIVE_LOG']),
            refs=dict(competencies=[competencies[c] for c in codes]),
            children=dict(prerequisites=prerequisites) if prerequisites else None)
        clusters.append(cluster)
        item = obj('Activities', 'RubricTask', key + '_formative_item', dict(
            promptStem=m['work'] + ' Submit ' + m['artifact'] + '. Verify: ' + m['checks'] + ' Explain: ' + m['decision'],
            difficulty='Foundational' if index == 0 else 'Intermediate', evidenceType='RUBRIC_MICROTASK', rubricKey='RUBRIC_' + key),
            refs=dict(tags=[competencies[c] for c in codes], resources=[brief, rubric_resource, policy]))
        items.append(item)
        crosswalk.append(dict(module=key, title=m['title'], target_ids=[t['id'] for t in module_targets],
                              competency_codes=codes, formative_item_id=item['id'], rubric_key='RUBRIC_' + key))

    persona = obj('iSQD', 'LearnerPersona', 'SE_AI_learner', dict(
        knowledge='Second-year computer science students who can program in one language and have used version control.',
        attitude='Some overtrust generated code, others avoid AI; both practise evidence-based judgment.',
        confidence='Mixed; paired work, instructor modelling and individual teach-backs build independence.',
        role='HE students working in pairs on a shared project, with individual evidence for each module.'))
    task = obj('iSQD', 'LearningTask', 'SE_AI_course_task', dict(
        description='Specify, design, verify and deliver TaskBoard, a small task-sharing service, using AI as a fallible collaborator under human verification.',
        risks=['Accepting plausible generated artefacts without checking them', 'Tests that repeat the implementation error',
               'Personal data in prompts', 'Unattributed reused or generated code'],
        constraints=['Draft design: 4 weekly modules, 12 contact hours and 16 independent hours; no official credit is asserted.',
                     'Synthetic data only; no paid AI service or account is required.',
                     'Two ordered targets per module; the module order is a recommended sequence.',
                     'Formative rubrics give feedback; the instructor assesses the actual work.']),
        children=dict(learningTargets=targets))
    scenario = obj('iSQD', 'Scenario', 'SE_AI_scenario', dict(
        title='Software Engineering with critical AI support', setting='HE',
        challenge='Students engineer a small service from requirements to release while using AI assistants critically, '
                  'showing testable requirements, justified design, executed verification and responsible delivery.'),
        children=dict(learner=[persona], task=[task]))
    domain = obj('Certification Design', 'Domain', 'SE_AI_domain', dict(
        ID='SE_AI', title='Software engineering with critical AI collaboration',
        description='Four linked competency clusters; evidence and progression rules are a course design proposal.'),
        children=dict(ownedClusters=clusters))
    blueprint = obj('Certification Design', 'AssessmentBlueprint', 'SE_AI_formative', dict(
        ID='SE_AI_formative', title='Formative module portfolio', status='Draft', version='1.0.0',
        evidenceTypesAllowed=['RUBRIC_MICROTASK', 'TOOL_TRACE', 'REFLECTIVE_LOG'],
        description='One rubric task per module; feedback and one revision. Criteria are in the referenced rubric resources.',
        itemCoverageRules='Assess every cluster through its module item; do not infer a whole external competency from one task.',
        passRules='No direct grade: an unmet check triggers a concrete remediation recommendation.',
        timingRules='One checkpoint per module, feedback within a week.',
        identifyIntegrityRules='Inspect the actual artefacts and traces; attribute AI and peer assistance; no achievement is pre-recorded.'),
        refs=dict(clusterReference=clusters), children=dict(assessmentItems=items))

    models = [model(CATALOG, 'Competencies', list(competencies.values())),
              model('SE_AI_Resources', 'Resources', resources),
              model(SCENARIO, 'iSQD', [scenario]),
              model('SE_AI_Assessment', 'Certification Design', [domain, blueprint])]
    owned, owners = {}, {}
    for md in models:
        for item in objects(md['objects']):
            owned[item['id']], owners[item['id']] = item, md['metadata']['id']
    mmids = {name: definition['metadata']['id'] for name, definition in mm.items()}
    mm_artifacts = [deepcopy(a) for a in source['artifacts']['metamodels'] if a['id'] in mmids.values()]
    dependencies = {a['id']: a['usesMetamodelIds'] for a in mm_artifacts}
    for md in models:
        external, seen = set(), set()
        pending = [r['$ref'] for item in objects(md['objects']) for refs in item.get('references', {}).values() for r in refs]
        while pending:
            oid = pending.pop()
            if oid in seen:
                continue
            seen.add(oid)
            if owners[oid] != md['metadata']['id']:
                external.add(oid)
            pending.extend(r['$ref'] for refs in owned[oid].get('references', {}).values() for r in refs)
        md['externalObjects'] = [deepcopy(owned[oid]) for oid in sorted(external)]
        used = {md['metamodel']['id']} | {item['class']['metamodel']['id'] for item in objects(md['objects'])}
        while True:
            grown = used | {dep for mid in used for dep in dependencies[mid]}
            if grown == used:
                break
            used = grown
        md['externalMetamodels'] = [dict(**descriptor(name), packages=deepcopy(definition['packages']))
                                     for name, definition in mm.items() if mmids[name] in used and mmids[name] != md['metamodel']['id']]
    megamodel = dict(format='jjodel-megamodel', formatVersion='1.0', megamodelVersion='1.0',
                     metadata=dict(project=dict(id=uid('project'), name='SE AI - Software Engineering with AI literacy'),
                                   exportedAt=STAMP, jjodelVersion='v2.23'),
                     artifacts=dict(metamodels=mm_artifacts, models=[dict(id=m['metadata']['id'], name=m['metadata']['name'],
                                    instanceofMetamodelId=m['metamodel']['id']) for m in models], transformations=[], viewpoints=[]),
                     edges=[], definitions=dict(metamodels=metamodels, models=models))
    for md in models:
        megamodel['edges'].append(dict(id='derived_' + md['metadata']['id'] + '_conformsTo_' + md['metamodel']['id'],
            source=dict(id=md['metadata']['id'], name=md['metadata']['name'], type='model'),
            target=dict(id=md['metamodel']['id'], name=md['metamodel']['name'], type='metamodel'), type='conformsTo', origin='derived'))
    names = {a['id']: a['name'] for a in mm_artifacts}
    for a in mm_artifacts:
        for dep in a['usesMetamodelIds']:
            megamodel['edges'].append(dict(id='derived_' + a['id'] + '_uses_' + dep,
                source=dict(id=a['id'], name=a['name'], type='metamodel'), target=dict(id=dep, name=names[dep], type='metamodel'),
                type='uses', origin='derived'))
    path = OUT / 'SE-AI.megamodel.json'
    dump(path, megamodel)
    audit = audit_project(path)
    assert not audit['findings'], audit['findings']
    report = validate_scenario(path, scenario=SCENARIO, competencies=CATALOG)
    assert report['conforms_to_generated_contracts'], report['findings']
    assert not report['transport_conversions'], report['transport_conversions']
    assert len(targets) == 8 and sum(len(t['children']['strategy'][0]['children']['activities']) for t in targets) == 16
    for rubric in rubrics.values():
        assert sum(c['weight'] for c in rubric['criteria']) == 100
    validation = dict(status='PASS', source=str(SOURCE.relative_to(ROOT)),
                      source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                      megamodel_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      scenario=SCENARIO, competencies=CATALOG,
                      counts=dict(modules=len(MODULES), learning_targets=len(targets), activities=16,
                                  competencies=len(competencies), resources=len(resources), clusters=len(clusters),
                                  assessment_items=len(items)),
                      scenario_findings=report['findings'], competency_mapping=mapping, crosswalk=crosswalk,
                      limitations=['Authored proposal: durations, rubrics and rules are design choices, not an official syllabus.',
                                   'No native .jjodel project is produced; upload the megamodel JSON.'])
    dump(OUT / 'validation.json', validation)
    print(json.dumps(dict(megamodel=str(path.relative_to(ROOT)), **validation['counts'],
                          scenario_findings=len(report['findings'])), indent=2))


if __name__ == '__main__':
    main()
