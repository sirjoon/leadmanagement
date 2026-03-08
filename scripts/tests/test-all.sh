#!/bin/bash
# ============================================================
# MagicCRM Full Regression Test Suite
#
# Usage:
#   bash scripts/tests/test-all.sh          # Test against dev
#   TEST_ENV=prod bash scripts/tests/test-all.sh   # Test against prod
#
# This runs ALL test suites in order and reports a combined summary.
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

ENV="${TEST_ENV:-dev}"
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  TARGET="https://magiccrm.geekzlabs.com"
else
  TARGET="https://dev.magiccrm.geekzlabs.com"
fi

echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     MagicCRM Full Regression Test Suite      ║${NC}"
echo -e "${BOLD}║     Target: $TARGET  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
SUITE_RESULTS=()

run_suite() {
  local name="$1"
  local script="$2"

  echo -e "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}${BOLD}  Running: $name${NC}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  if bash "$SCRIPT_DIR/$script" 2>&1; then
    SUITE_RESULTS+=("PASS|$name")
  else
    SUITE_RESULTS+=("FAIL|$name")
  fi
}

# Run all suites
run_suite "Story 1: Schema Changes" "test-story1-schema.sh"
run_suite "Story 2: Label Changes" "test-story2-labels.sh"
run_suite "Story 3: DNR Dialog" "test-story3-dnr.sh"
run_suite "Story 4: Sync + Auto-refresh" "test-story4-sync.sh"
run_suite "Story 5: Visited Tab" "test-story5-visited.sh"
run_suite "Story 11: Navigation" "test-story11-nav.sh"
run_suite "Role-Based Access" "test-roles.sh"
run_suite "Core Regression" "test-regression.sh"
run_suite "Frontend Health" "test-frontend.sh"

# Combined summary
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          Combined Test Results                ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════╣${NC}"

for result in "${SUITE_RESULTS[@]}"; do
  IFS='|' read -r status name <<< "$result"
  if [ "$status" = "PASS" ]; then
    echo -e "${BOLD}║  ${GREEN}PASS${NC}${BOLD}  $name${NC}"
  else
    echo -e "${BOLD}║  ${RED}FAIL${NC}${BOLD}  $name${NC}"
  fi
done

echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"

# Check for any failures
FAIL_COUNT=0
for result in "${SUITE_RESULTS[@]}"; do
  IFS='|' read -r status name <<< "$result"
  if [ "$status" = "FAIL" ]; then
    ((FAIL_COUNT++))
  fi
done

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "\n${RED}${BOLD}$FAIL_COUNT suite(s) had failures. Review output above.${NC}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}All test suites passed!${NC}"
  exit 0
fi
