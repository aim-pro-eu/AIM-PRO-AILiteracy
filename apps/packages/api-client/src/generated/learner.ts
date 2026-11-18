// Generated from services/openapi/learner.json by
// apps/packages/api-client/scripts/generate.mjs. Do not edit; run
// `npm run generate:client` in apps/ after the snapshot changes.

export interface paths {
    "/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Finish the code flow, map the identity and start a server-side session */
        get: operations["callback_auth_callback_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Start the OIDC code flow with PKCE at the identity provider */
        get: operations["login_auth_login_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** End the session; the result is the provider logout URL to visit, if any */
        post: operations["logout_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The signed-in subject and the CSRF token for writes */
        get: operations["session_auth_session_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The active courses the signed-in subject is enrolled in as a learner */
        get: operations["courses_courses_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses/{context_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The validated course of a delivery as its learners see it; never an answer key */
        get: operations["course_courses__context_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses/{context_id}/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit the learner's attempt; the same request id and attempt return the same evidence, another attempt 409 */
        post: operations["submit_courses__context_id__attempts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses/{context_id}/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The learner's own attempts, evidence, applied evaluations and learning states */
        get: operations["progress_courses__context_id__progress_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses/{context_id}/questions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The learner's own questions in the course, newest first, with their status */
        get: operations["listing_courses__context_id__questions_get"];
        put?: never;
        /** Ask the Teacher or the Socratic coach; the same request id and question return the same job, another question 409 */
        post: operations["ask_courses__context_id__questions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/courses/{context_id}/questions/{request_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** One of the learner's own questions with its status and, once answered, the response */
        get: operations["read_courses__context_id__questions__request_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/enrolments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Join the course whose code this is, as a learner; the same request returns the same course */
        post: operations["join_enrolments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness; needs no session */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** Activity */
        Activity: {
            assessment?: components["schemas"]["EntityRef"] | null;
            /** Expected Evidence */
            expected_evidence: string[];
            /** Format */
            format: string;
            /** Instruction */
            instruction: string;
            /** Intent */
            intent: string;
            /** Materials */
            materials: components["schemas"]["EntityRef"][];
            /** Outcomes */
            outcomes: components["schemas"]["EntityRef"][];
            ref: components["schemas"]["EntityRef"];
            /** Strategies */
            strategies: components["schemas"]["EntityRef"][];
        };
        /**
         * Answer
         * @description The response to a learner's question as the learner reads it: never a proposal, a decision or a state.
         */
        Answer: {
            /**
             * Citations
             * @default []
             */
            citations: components["schemas"]["Citation"][];
            /** Content */
            content: string;
            /**
             * Coverage
             * @default []
             */
            coverage: components["schemas"]["EntityRef"][];
            /**
             * Findings
             * @default []
             */
            findings: components["schemas"]["Finding"][];
            /**
             * Kind
             * @enum {string}
             */
            kind: "ANSWER" | "CLARIFICATION" | "PARTIAL_RESULT" | "FAILURE";
        };
        /**
         * Assessment
         * @description An assessment as the learner sees it (D20): never its answer key.
         */
        Assessment: {
            /** Accepted Evidence */
            accepted_evidence: string[];
            /** Activities */
            activities: components["schemas"]["EntityRef"][];
            /** Conditions */
            conditions: string[];
            /** Outcomes */
            outcomes: components["schemas"]["EntityRef"][];
            ref: components["schemas"]["EntityRef"];
            rubric?: components["schemas"]["Rubric"] | null;
        };
        /**
         * AttemptSubmission
         * @description The learner's attempt at one activity, under the learner's own request id.
         */
        AttemptSubmission: {
            activity: components["schemas"]["EntityRef"];
            /** Content */
            content: string;
            /**
             * Request Id
             * @description The learner's own request id
             */
            request_id: string;
        };
        /** Citation */
        Citation: {
            /** Locator */
            locator?: string | null;
            source: components["schemas"]["EntityRef"];
            /** Supportedclaim */
            supportedClaim: string;
        };
        /**
         * Competence
         * @description An ALM ``Topic`` that a learning outcome addresses; the studio shows it as a competence.
         */
        Competence: {
            /** Definition */
            definition: string;
            /** Name */
            name: string;
            ref: components["schemas"]["EntityRef"];
        };
        /** CourseList */
        CourseList: {
            /** Courses */
            courses: components["schemas"]["LearnerCourse"][];
        };
        /**
         * CourseView
         * @description The validated course of a delivery as its learners see it (D20).
         */
        CourseView: {
            /** Assessments */
            assessments: components["schemas"]["Assessment"][];
            /** Competences */
            competences: components["schemas"]["Competence"][];
            /** Context Id */
            context_id: string;
            /** Materials */
            materials: components["schemas"]["Material"][];
            /** Outcomes */
            outcomes: components["schemas"]["Outcome"][];
            /** Strategies */
            strategies: components["schemas"]["Strategy"][];
            structure: components["schemas"]["Node"];
            /** Title */
            title: string;
        };
        /** EntityRef */
        EntityRef: {
            /** Id */
            id: string;
            /** Type */
            type: string;
            /** Version */
            version: string;
        };
        /** ErrorBody */
        ErrorBody: {
            /** Detail */
            detail: string | components["schemas"]["ValidationIssue"][];
            /** Error */
            error: string;
            /** Request Id */
            request_id: string;
        };
        /**
         * Evaluation
         * @description An evaluation of the learner's evidence that a person approved and applied.
         */
        Evaluation: {
            assessment: components["schemas"]["EntityRef"];
            /** Evidence */
            evidence: components["schemas"]["EntityRef"][];
            /** Judgments */
            judgments: components["schemas"]["Judgment"][];
            /** Mode */
            mode: string;
            ref: components["schemas"]["EntityRef"];
            /** Result */
            result?: string | null;
        };
        /**
         * Evidence
         * @description What the learner handed in, as it was observed.
         */
        Evidence: {
            activity: components["schemas"]["EntityRef"];
            /** Content Or Locator */
            content_or_locator: string;
            /** Kind */
            kind: string;
            /** Observed At */
            observed_at: string;
            occurrence: components["schemas"]["EntityRef"];
            /** Outcomes */
            outcomes: components["schemas"]["EntityRef"][];
            ref: components["schemas"]["EntityRef"];
        };
        /** Finding */
        Finding: {
            /** Code */
            code: string;
            /** Reason */
            reason: string;
            /**
             * Resolution
             * @default Correct the data or provide the required configuration.
             */
            resolution: string;
            /**
             * Severity
             * @default BLOCKING
             * @enum {string}
             */
            severity: "BLOCKING" | "WARNING" | "INFORMATION";
            /** Target */
            target: string;
        };
        /** HealthView */
        HealthView: {
            /**
             * Status
             * @constant
             */
            status: "ok";
        };
        /**
         * JoinRequest
         * @description The course code, as typed or carried by a join link, under the learner's own request id.
         */
        JoinRequest: {
            /** Code */
            code: string;
            /**
             * Request Id
             * @description The learner's own request id
             */
            request_id: string;
        };
        /**
         * Judgment
         * @description One rubric criterion of an applied evaluation: its level (none when undetermined) and the reason.
         */
        Judgment: {
            /** Criterion Key */
            criterion_key: string;
            /** Level Key */
            level_key?: string | null;
            /** Reason */
            reason: string;
        };
        /**
         * LearnerCourse
         * @description A course the learner is enrolled in: its delivery context and the name of its learning design.
         */
        LearnerCourse: {
            /** Context Id */
            context_id: string;
            /** Title */
            title: string;
        };
        /**
         * LearningState
         * @description The learner's state for one outcome, derived only from applied evaluations.
         */
        LearningState: {
            /** Basis */
            basis: components["schemas"]["EntityRef"][];
            outcome: components["schemas"]["EntityRef"];
            /** Progress */
            progress: string;
            ref: components["schemas"]["EntityRef"];
            /** Verification */
            verification: string;
        };
        /** LogoutView */
        LogoutView: {
            /** End Session Url */
            end_session_url: string | null;
        };
        /**
         * Material
         * @description A resource bound to this delivery by a reviewed binding the learner may read.
         */
        Material: {
            /** Content Or Locator */
            content_or_locator: string;
            /** Language */
            language?: string | null;
            ref: components["schemas"]["EntityRef"];
            /** Title */
            title: string;
            /** Usage Conditions */
            usage_conditions: string;
        };
        /**
         * Node
         * @description A phase or unit of the syllabus, with its activities and the parts directly inside it, in order.
         */
        Node: {
            /** Activities */
            activities: components["schemas"]["Activity"][];
            /** Children */
            children: components["schemas"]["Node"][];
            /** Composition */
            composition?: string | null;
            /** Estimated Duration */
            estimated_duration?: string | null;
            /** Kind */
            kind: string;
            /** Name */
            name: string;
            /** Outcomes */
            outcomes: components["schemas"]["EntityRef"][];
            ref: components["schemas"]["EntityRef"];
            /** Strategies */
            strategies: components["schemas"]["EntityRef"][];
        };
        /**
         * Occurrence
         * @description One of the learner's attempts at an activity.
         */
        Occurrence: {
            activity: components["schemas"]["EntityRef"];
            /** Evidence */
            evidence: components["schemas"]["EntityRef"][];
            process_node?: components["schemas"]["EntityRef"] | null;
            ref: components["schemas"]["EntityRef"];
            /** Status */
            status: string;
        };
        /** Outcome */
        Outcome: {
            /** Competences */
            competences: components["schemas"]["EntityRef"][];
            /** Kind */
            kind?: string | null;
            ref: components["schemas"]["EntityRef"];
            /** Statement */
            statement: string;
            /** Target Level */
            target_level?: string | null;
        };
        /** OwnProgress */
        OwnProgress: {
            /** Context Id */
            context_id: string;
            /** Evaluations */
            evaluations: components["schemas"]["Evaluation"][];
            /** Evidence */
            evidence: components["schemas"]["Evidence"][];
            /** Learning States */
            learning_states: components["schemas"]["LearningState"][];
            /** Occurrences */
            occurrences: components["schemas"]["Occurrence"][];
        };
        /**
         * Question
         * @description A learner's question: to the Teacher (``EXPLAIN``) or to the Socratic coach (``SOCRATIC_GUIDANCE``).
         *
         *     The coach follows Socratic option b: its worker may read sources that hold the solution, and only what it
         *     returns is judged. A problem stays with the coach until the learner switches from it explicitly.
         */
        Question: {
            /**
             * Activities
             * @default []
             */
            activities: components["schemas"]["EntityRef"][];
            /**
             * Intent
             * @default EXPLAIN
             * @enum {string}
             */
            intent: "EXPLAIN" | "SOCRATIC_GUIDANCE";
            /** Problem Key */
            problem_key?: string | null;
            /**
             * Switch From Socratic
             * @default false
             */
            switch_from_socratic: boolean;
            /** Text */
            text: string;
        };
        /**
         * QuestionList
         * @description The learner's own questions in a course, newest first.
         */
        QuestionList: {
            /** Questions */
            questions: components["schemas"]["QuestionView"][];
        };
        /**
         * QuestionRequest
         * @description A question under the learner's own request id.
         */
        QuestionRequest: {
            question: components["schemas"]["Question"];
            /**
             * Request Id
             * @description The learner's own request id
             */
            request_id: string;
        };
        /**
         * QuestionView
         * @description A learner's question: its status and, once its run has ended, the response or the reason it has none.
         */
        QuestionView: {
            /** Created */
            created: string;
            /** Detail */
            detail?: string | null;
            question: components["schemas"]["Question"];
            /** Request Id */
            request_id: string;
            response?: components["schemas"]["Answer"] | null;
            /**
             * Status
             * @enum {string}
             */
            status: "QUEUED" | "RUNNING" | "PROPOSED" | "REJECTED" | "FAILED" | "ABANDONED" | "COMPLETED" | "AWAITING_CHOICE" | "ACCEPTED" | "DECLINED";
            /** Updated */
            updated: string;
        };
        /** Rubric */
        Rubric: {
            /** Criteria */
            criteria: components["schemas"]["RubricCriterion"][];
            /** Name */
            name: string;
            ref: components["schemas"]["EntityRef"];
        };
        /** RubricCriterion */
        RubricCriterion: {
            /** Description */
            description: string;
            /** Key */
            key: string;
            /** Levels */
            levels: components["schemas"]["RubricLevel"][];
            /** Outcomes */
            outcomes: components["schemas"]["EntityRef"][];
        };
        /** RubricLevel */
        RubricLevel: {
            /** Descriptor */
            descriptor: string;
            /** Key */
            key: string;
        };
        /** SessionView */
        SessionView: {
            /** Csrf Token */
            csrf_token: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /** Subject Key */
            subject_key: string;
        };
        /**
         * Strategy
         * @description A teaching strategy of the course.
         */
        Strategy: {
            /** Constraints */
            constraints: string[];
            /** Family */
            family: string;
            /** Name */
            name: string;
            /** Rationale */
            rationale: string;
            ref: components["schemas"]["EntityRef"];
        };
        /** ValidationIssue */
        ValidationIssue: {
            /** Loc */
            loc: (string | number)[];
            /** Msg */
            msg: string;
            /** Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    callback_auth_callback_get: {
        parameters: {
            query?: {
                code?: string | null;
                error?: string | null;
                state?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            303: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Identity provider unavailable */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    login_auth_login_get: {
        parameters: {
            query?: {
                /** @description Local path to return to */
                return_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Identity provider unavailable */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    logout_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LogoutView"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    session_auth_session_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionView"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    courses_courses_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseList"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    course_courses__context_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CourseView"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    submit_courses__context_id__attempts_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttemptSubmission"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Evidence"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    progress_courses__context_id__progress_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnProgress"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    listing_courses__context_id__questions_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuestionList"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    ask_courses__context_id__questions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuestionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuestionView"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    read_courses__context_id__questions__request_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                context_id: string;
                request_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuestionView"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    join_enrolments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JoinRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LearnerCourse"];
                };
            };
            /** @description No valid session */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not authorized, unmapped identity or missing CSRF token */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Not found, or the context is unavailable */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Conflict with the current state; reload and retry */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Invalid request or data */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthView"];
                };
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorBody"];
                };
            };
        };
    };
}
