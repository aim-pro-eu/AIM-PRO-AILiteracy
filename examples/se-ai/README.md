# SE-AI: Software Engineering with AI literacy (case study)

A small AIM-PRO course model to test, in the studio and in about an hour, everything the prototype does up to S11:
from the uploaded model to a reviewed evaluation of a learner's attempt. Authored proposal: durations, rubrics and
rules are design choices, not an official syllabus. Synthetic data only.

Owner decisions of 17 November 2026: Anthropic for every agent (live run authorized for this case study), 8 units,
the owner drives the studio, sources from the current WP3 corpus.

## The model

`build.py` writes `SE-AI.megamodel.json` from the unchanged 4 November 2026 metamodels
(`docs/resources/aimpro-megamodel-2026-11-04.json`, read only) and checks it (`aimpro.audit`, scenario conformance,
no transport conversion); `validation.json` records the result.

| Model | Content |
| --- | --- |
| `SE_AI_Competencies` | SE01–SE05 (requirements, design, testing, review and maintenance, responsible delivery), authored; D05, D08, D10, D16, R27 copied from `elena_usecase_competencies` with new ids (vocabulary case corrected, recorded) |
| `SE_AI_Resources` | AI-use policy, TaskBoard project brief, four module briefs, four formative rubrics |
| `SE_AI_iSQD` | one HE scenario, persona and task; 8 learning targets (2 per module), each with one strategy and two activities |
| `SE_AI_Assessment` | a domain with four competency clusters (sequence M1→M4) and a formative blueprint with four rubric tasks |

| Module | Targets | Case |
| --- | --- | --- |
| M1 Requirements with AI critique | Familiarization, CollaborativeDesign | user stories for TaskBoard; reject invented features and personal data |
| M2 Design and modelling decisions | CollaborativeDesign, ReflectivePractice | components vs an AI-proposed god class |
| M3 Testing AI-generated code | ReflectivePractice, AuthenticExperience | generated tests that repeat the code's off-by-one error |
| M4 Code review, maintenance and responsible delivery | CollaborativeDesign, AuthenticExperience | a pull request mixing refactoring and a behaviour change |

Eight targets give about eight syllabus units, so every generator writes one block of units.

```sh
.venv/bin/python examples/se-ai/build.py
```

`SE-AI.jjodel` is the same content as a native jjodel project (Dashboard → File → Import Project). It is built as
`examples/lpo-ai/build_native.cjs` builds LPO-AI: from the same native template (`AIM Pro (4).jjodel`, SHA-256
recorded in `native-validation.json`), read only for the built-in views, primitives and record shapes, with none of
its user records. The checks cover every object and value and the compressed round trip; no import into the jjodel
UI has been run.

```sh
node examples/se-ai/build_native.cjs /path/to/native-template.jjodel /path/to/async-lz-string
```

## Before the test (about 5 minutes, outside the hour)

1. The code of S11 (PR #131): merged into `main`, or branch `feat/s11-membership-assessor` checked out.
2. Keycloak restarted, so that it imports the realm with `dev-assessor`:
   `docker compose -f compose.identity.yml up -d --force-recreate --wait` (same passwords as before).
3. The WP3 corpus running (`py-prototype-wp3-postgres-1`), `ANTHROPIC_API_KEY` in `.env`.
4. Ports 58000/58001 free. Start the stack: `examples/se-ai/stack.sh` (new state in `/tmp/alm-se-ai`; logs
   `api.log` and `worker.log` there). The worker is `live_worker.py`: every agent on the `anthropic` profile
   (`claude-sonnet-4-6`), in that process only.
5. Two browser windows: a normal one for `dev-admin`, a private one for `dev-assessor`.

## The test, step by step

Times are estimates; model steps depend on the provider. The course ids below are suggestions.

| # | Who | Step (studio labels) | Expected | Time |
| --- | --- | --- | --- | --- |
| 1 | dev-admin | Home → "Create a course": `se-ai` | the build page | 1 |
| 2 | dev-admin | "1. Upload the AIM-PRO model": `SE-AI.megamodel.json`, scenario `SE_AI_iSQD`, catalogue `SE_AI_Competencies` | accepted, "The scenario fits the course model", 55 objects | 1 |
| 3 | dev-admin | "2. Prepare the sources": search scope `wp3`, two or three queries (e.g. "evaluating AI generated output", "privacy personal data prompts", "human oversight of AI") | excerpts found; pick 3–5, give purpose and limits; prepare; "Accept these sources" | 5 |
| 4 | dev-admin | "3. Draft the syllabus with the Curator" on the accepted sources | job proposed; the syllabus in words, about 8 units; the SE part without SE sources is reported as a gap | 4–6 |
| 5 | dev-admin | Optional: request a revision with a reason, then "Ask the Curator for a revised syllabus"; or "Edit this syllabus yourself" | a revised proposal compared with the first | (+5) |
| 6 | dev-admin | Approve and apply the syllabus; "4. Initialize the project" → "Propose the project" (any project id), approve and apply | the course page shows the structure | 2 |
| 7 | dev-admin | "5. Assessments with the Evaluator" → "Ask the Evaluator" (requirements optional, see below); when the job is proposed, review the rubrics and assessments, approve, apply. No rubric exists before the job ends | one block, then the final review | 6–8 |
| 8 | dev-admin | "Ask the Teacher"; approve and apply it **before** "Ask the Trainer"; review, approve, apply | one block each | 12–15 |
| 9 | dev-admin | "8. Completion rules" → "Propose the completion rules", approve, apply | a rule on every part | 1 |
| 10 | dev-admin | "9. Release" → "Propose the release", approve, apply; inspect it from the course page | no problems listed | 2 |
| 11 | dev-admin | Release page → "Create the delivery course" with a **new** id, `se-ai-delivery` (not `se-ai`: #132); keep every proposed resource; "Propose the import"; follow "Review the import" (above the policy preview); the decision is at the end of the page (#134); approve, then "Apply the change" at the top | the course is unavailable until the policy is installed | 3 |
| 12 | operator | Install the reviewed preview: "Download the preview as …" on the import's review page, then move the file unchanged into `/tmp/alm-se-ai/policies/` | "Try again": the delivery course opens again | 1 |
| 13 | dev-admin | Course page → "Members of this course": add `assessor` as Assessor, approve and apply; **then** `learner` as Student, approve and apply. One at a time: a second proposal made before the first is applied goes stale (#133) | two new members | 3 |
| 14 | dev-admin | Course page → "Propose activation" once (#133), follow "Review the activation", approve, apply | Status Active, Mode Learning | 1 |
| 15 | learner (CLI) | `examples/se-ai/attempt.py --state /tmp/alm-se-ai --context se-ai-delivery` lists the assessments; `--activity N --response-file FILE` submits (the default response is a generic M1 answer) | an evidence reference | 1 |
| 16 | dev-assessor | Course `se-ai-delivery` → "Evaluate the students' submitted attempts"; choose Formative (or Formal); "Ask the assessor agent for a draft" | "The draft evaluation is ready" | 1–2 |
| 17 | dev-assessor | "Read the draft evaluation": agent, mode, response, each criterion with level and reason, result; approve and apply | applied; the attempt shows "Already evaluated" | 2 |

About 45–55 minutes without step 5. What to note for the review: times per job (`worker.log`), the review agent's
judgments ("How the review agent judged the drafts"), anything unclear in the studio, and whether the draft
evaluation's levels and reasons fit the response.

Optional requirements used in the first run (they are passed to the agent as written):

- Evaluator: "Write one formative assessment per syllabus unit, with an analytic rubric of three or four criteria." /
  "Assess both the software engineering work and the critical use of AI: what the student accepted, rejected or
  changed, and why." / "Use only synthetic data in every task: no real people, e-mail addresses or personal data."
- Teacher: "Use TaskBoard as the running example and show at least one AI output the student must check, correct or
  reject."
- Trainer: "Each exercise asks the student to record what they accepted, rejected or changed from the AI, and why."

## First run (17 November 2026)

The owner ran the script in the studio on `main` after PR #131, every agent on Anthropic (`claude-sonnet-4-6`), and
reached an applied formative evaluation. Times from the jobs store:

| Job | Time |
| --- | --- |
| Source discovery and preparation | 17 s |
| Curator syllabus | 3 min 09 s |
| Evaluator | 5 min 31 s |
| Teacher | 5 min 23 s |
| Trainer | 5 min 20 s |
| Runtime assessor draft | 15 s |

About 20 minutes of model time; no job failed or was rejected. The learner's synthetic answer to the M1 assessment
(accept or reject two AI-generated user stories) was of middling quality on purpose: it rejected the invented payment
story correctly and accepted the other story without noticing its real-looking e-mail address. The draft evaluation
gave levels 3 (flaw identification), 2 (claim attribution: no boundary case) and 0 (data-privacy check: the e-mail
address not flagged), and a result that asks the learner to revisit the personal-data issue. The Evaluator's rubric
had a privacy criterion because of the requirements above.

Findings in the studio: #132 (an existing course id as delivery course), #133 (pending activation and membership
proposals), #134 (the next action on long review pages). The script above already works around them. The first
`stack.sh` did not create the empty learning store, which the API and the worker refuse to create; fixed.

## Known limits

- No learner application yet (S12/S13): step 15 uses `attempt.py`, a dev-only stand-in for submission.
- A FORMAL evaluation verifies nothing without an authored verification rule; the state stays IN_PROGRESS/UNVERIFIED.
- A second attempt by the learner before an evaluation is applied makes that evaluation proposal stale (Chat 29,
  finding 3): apply it first.
- `live_worker.py` and `stack.sh` call a paid provider: run them only with the owner's authorization.
- The WP3 corpus has no Software Engineering sources: the SE content is not grounded.
