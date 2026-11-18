#!/bin/zsh
# The SE-AI case-study stack: a new empty state in /tmp/alm-se-ai, the Authoring API on 58001, the live worker
# (every agent on Anthropic, examples/se-ai/live_worker.py) and the studio (Vite) on 58000. Ctrl-C stops all three.
#
# Before: Keycloak restarted from compose.identity.yml (it imports dev-assessor at start), the WP3 corpus up,
# ANTHROPIC_API_KEY in .env, ports 58000/58001 free. The worker calls a paid provider: owner-authorized runs only.
set -e
ROOT=${0:A:h:h:h}
PYTHON=$ROOT/.venv/bin/python
STATE=${ALM_SE_AI_STATE:-/tmp/alm-se-ai}
: ${ALM_OIDC_CLIENT_SECRET:=$(docker inspect py-prototype-alm-keycloak-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^ALM_OIDC_CLIENT_SECRET=//p')}
: ${ALM_OIDC_CLIENT_SECRET:?Set ALM_OIDC_CLIENT_SECRET first}
export ALM_OIDC_CLIENT_SECRET
export LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false

if [[ -e $STATE && $1 != --keep ]]; then
  echo "$STATE exists: pass --keep to continue with it, or remove it for a new run" >&2
  exit 2
fi
mkdir -p $STATE/policies $STATE/exports
[[ -f $STATE/course-template.json ]] || \
  echo '{"format": 1, "creators": ["admin"], "source_scopes": {"wp3": ["wp3"]}}' > $STATE/course-template.json

export ALM_STORE=$STATE/alm.sqlite ALM_POLICY_DIR=$STATE/policies ALM_JOBS_STORE=$STATE/jobs.sqlite \
  ALM_AIMPRO_EXPORTS=$STATE/exports
# Course codes (S12b) are derived from this host secret: drawn once for the state, kept with it.
[[ -f $STATE/enrolment-secret ]] || (umask 077; openssl rand -hex 32 > $STATE/enrolment-secret)
export ALM_ENROLMENT_SECRET=$(<$STATE/enrolment-secret)
cd $ROOT
# The API and the worker never create the learning store: create it empty here.
[[ -f $ALM_STORE ]] || $PYTHON -c 'import sys; from learning.store import LearningStore; LearningStore(sys.argv[1]).close()' $ALM_STORE
ALM_COURSE_TEMPLATE=$STATE/course-template.json \
ALM_OIDC_ISSUER=http://127.0.0.1:58080/realms/alm-dev ALM_OIDC_CLIENT_ID=alm-authoring-api \
ALM_OIDC_REDIRECT_URI=http://127.0.0.1:58000/auth/callback ALM_OIDC_POST_LOGOUT_REDIRECT_URI=http://127.0.0.1:58000/ \
ALM_IDENTITY_MAP=infra/keycloak/identity-map.dev.json ALM_API_COOKIE_SECURE=false \
  $PYTHON -m services.authoring_api --port 58001 > $STATE/api.log 2>&1 &
API=$!
$PYTHON examples/se-ai/live_worker.py --poll 1 > $STATE/worker.log 2>&1 &
WORKER=$!
trap "kill $API $WORKER 2>/dev/null" EXIT INT TERM
echo "API log: $STATE/api.log, worker log: $STATE/worker.log; studio on http://127.0.0.1:58000/studio/"

cd $ROOT/apps/studio && npx vite
