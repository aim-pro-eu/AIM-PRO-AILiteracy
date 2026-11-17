"""Authored course proposal for the SE-AI case study: every duration, weight and rule is a design choice."""

SE_COMPETENCIES = [
    ("SE01", "Requirements and acceptance criteria",
     "Elicit, write and validate user stories with testable acceptance criteria and explicit open questions.", "Foundational"),
    ("SE02", "Software design and modelling",
     "Allocate responsibilities across components and justify a design with a model and a stated tradeoff.", "Intermediate"),
    ("SE03", "Testing and verification",
     "Derive unit and regression tests from requirements and distinguish executed evidence from claims.", "Intermediate"),
    ("SE04", "Code review and maintenance",
     "Review and refactor a change with focused commits while preserving observable behaviour.", "Intermediate"),
    ("SE05", "Professional and responsible delivery",
     "Document decisions, data handling and attribution so that another engineer can reproduce and audit the work.", "Intermediate"),
]

# Existing AI literacy competencies of the 4 November 2026 catalogue, reused unchanged except for vocabulary case.
AI_COMPETENCIES = ("D05", "D08", "D10", "D16", "R27")

# Each module has two ordered targets; each target one strategy with two activities (iSQD: one strategy per target).
FAMILIES = {
    "F": ("Familiarization", "ScaffoldedExploration", "ModellingAIPractices",
          "Explain the module's core idea and predict a concrete failure before working on the case."),
    "C": ("CollaborativeDesign", "CoCreationWithAI", "IterativePrompting",
          "Produce the module artefact in pairs, with any AI suggestion inspected and attributed."),
    "R": ("ReflectivePractice", "OutputEvaluation", "DocumentedReflection",
          "Evaluate the artefact and an AI or peer critique against explicit checks, and record a decision."),
    "A": ("AuthenticExperience", "ResponsibleAIUse", "AIAssistedMicroteaching",
          "Apply the skill to the shared project and explain the actual result individually."),
}

MODULES = [
    dict(key="M1", title="Requirements with AI critique", targets=("F", "C"), se=["SE01", "SE05"], ai=["D08", "D16"],
         objective="Write user stories with testable acceptance criteria for TaskBoard and use an assistant only to find gaps.",
         case="A product owner sends a vague request: 'students need to share tasks and see deadlines'. An assistant drafts ten stories, "
              "two of which invent a payment feature and store real e-mail addresses.",
         work="Write five user stories in the INVEST style with Given/When/Then acceptance criteria and a list of open questions; "
              "ask an assistant for missing edge cases using synthetic data only.",
         checks="Every story has at least one negative acceptance criterion; no story contains invented features or personal data; "
                "every open question names who must answer it.",
         weak="The generated stories add a feature nobody asked for and an untestable criterion ('the app is fast').",
         decision="Which generated story did you reject or rewrite, and what evidence from the request justified it?",
         artifact="Story map, acceptance criteria, open-question list and AI-use note"),
    dict(key="M2", title="Design and modelling decisions", targets=("C", "R"), se=["SE02", "SE01"], ai=["D10", "D05"],
         objective="Design the TaskBoard components and justify one design decision against an AI-proposed alternative.",
         case="An assistant proposes a single TaskManager class that parses requests, stores tasks, sends notifications and formats output.",
         work="Draw a component and class diagram for three stories of M1; assign responsibilities; compare your design with the "
              "assistant's god-class proposal on cohesion, coupling and testability.",
         checks="Each story is traceable to the components it uses; no component owns two unrelated reasons to change; "
                "the decision record names one rejected alternative and its cost.",
         weak="The proposed god class makes every change touch the same file and cannot be tested without the notification service.",
         decision="Which responsibility did you move out of the proposed class, and how does a test show the benefit?",
         artifact="Component diagram, class responsibilities table and architecture decision record"),
    dict(key="M3", title="Testing AI-generated code", targets=("R", "A"), se=["SE03", "SE02"], ai=["D05", "R27"],
         objective="Verify an AI-generated implementation with requirement-derived tests and decide whether to accept it.",
         case="An assistant generates the deadline-reminder function and its tests; all tests pass, but they only repeat the implementation's arithmetic.",
         work="Derive boundary tests from the acceptance criteria (deadline today, tomorrow, past, time zones); run them against the generated code; "
              "record which tests fail and fix or reject the code.",
         checks="At least one test fails on the generated code before the fix; tests use a fixed clock; the record separates commands run from claims.",
         weak="The generated tests assert the same off-by-one computation as the code and therefore cannot detect it.",
         decision="What did the passing generated tests fail to prove, and which human-written test exposed it?",
         artifact="Test suite, execution trace, defect note and accept/reject decision"),
    dict(key="M4", title="Code review, maintenance and responsible delivery", targets=("C", "A"), se=["SE04", "SE05"], ai=["D10", "D16", "R27"],
         objective="Review and refactor a teammate's change, with AI as one reviewer, and deliver a documented, reproducible release.",
         case="A pull request mixes a refactoring with a behaviour change and includes a code snippet copied from an assistant without attribution.",
         work="Split the pull request into focused commits; review it with a checklist; ask an assistant for a second review and compare it with a peer's; "
              "write the release notes and the data/attribution statement.",
         checks="Behaviour is unchanged by the refactoring commit (tests show it); every review comment is addressed or answered; "
                "the release states its data handling and the origin of reused code.",
         weak="The AI review approves the change and suggests renaming variables but misses the behaviour change hidden in the refactoring.",
         decision="Which issue did the human review find that the AI review missed, and how will the team check it next time?",
         artifact="Focused commits, review record, release notes and responsible-delivery statement"),
]
