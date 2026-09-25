#!/usr/bin/env bash
# File the tasks in docs/TASKS.md as GitHub issues, once.
#
# Why this is a script and not something already done: the `gh` CLI on the machine
# that wrote docs/TASKS.md was authenticated as an account with pull-but-not-push on
# this repository, so it could read labels and never create one. Run this as an
# account that can write.
#
#   gh auth status          # confirm you are the right account
#   bash scripts/file_first_issues.sh
#
# Re-running it will create duplicates. It does not check.
set -euo pipefail
REPO="${REPO:-architsharm/agentfox}"

mklabel() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" 2>/dev/null || true; }
mklabel deploy    1d76db "Self-hosting and deployment"
mklabel cli       5319e7 "The agentfox command line"
mklabel detectors 0e8a16 "Guardrail detectors"

body() { # $1 = heading number in docs/TASKS.md
  awk -v n="^## $1\\\\. " '
    $0 ~ n {grab=1; next}
    grab && /^---$/ {exit}
    grab {print}
  ' docs/TASKS.md
  printf '\n\n---\nTaken from [`docs/TASKS.md`](https://github.com/%s/blob/main/docs/TASKS.md), which has the full list.\n' "$REPO"
}

file() { # $1 = number, $2 = title, $3 = labels
  echo "filing: $2"
  gh issue create --repo "$REPO" --title "$2" --label "$3" --body "$(body "$1")"
}

file 1 "Write the Fly.io deployment guide"                  "good first issue,documentation,deploy,help wanted"
file 2 "Add --json output to \`agentfox doctor\`"            "good first issue,cli,help wanted"
file 3 "Add --json output to \`agentfox check\`"             "good first issue,cli,help wanted"
file 4 "Write a bare-metal / systemd deployment guide"      "good first issue,documentation,deploy,help wanted"
file 5 "Add a lexical detector"                             "good first issue,detectors,help wanted"
file 6 "Test that the vendored wheel matches the source"    "good first issue,help wanted"

echo "done. Check: gh issue list --repo $REPO --label 'good first issue'"
