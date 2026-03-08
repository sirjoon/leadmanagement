#!/bin/bash
# ============================================================
# Story 4: Full Sync + Auto-refresh Test
# Tests: 5 appointment→lead sync paths, auto-refresh in bundle
#
# Sync paths:
#   COMPLETED → VISITED
#   NO_SHOW → LOST
#   DNR → DNR
#   TWC → TWC
#   RESCHEDULED → RESCHEDULED
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 4: Full Sync + Auto-refresh${NC}"
echo "Testing: 5 sync paths + auto-refresh polling"
echo "Target: $BASE_URL"
echo ""

ADMIN_TOKEN=$(get_admin_token)
BUNDLE=$(get_bundle_content)

section "Find Test Data"
resolve_test_data "$ADMIN_TOKEN" || exit 1

# ============================================================
# Sync Test Helper
# ============================================================
test_sync_path() {
  local appt_status="$1"
  local expected_lead_status="$2"
  local label="$3"
  local extra_body="${4:-}"

  # Update appointment
  local body
  if [ -n "$extra_body" ]; then
    body="$extra_body"
  else
    body="{\"status\":\"$appt_status\"}"
  fi

  curl -s -X PATCH "$API_URL/appointments/$TEST_APPT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" > /dev/null

  # Check lead status
  local actual_lead_status=$(get_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID")
  assert_eq "$label" "$actual_lead_status" "$expected_lead_status"

  # Revert
  revert_lead_to_booked "$ADMIN_TOKEN" "$TEST_LEAD_ID" > /dev/null
  revert_appointment_to_scheduled "$ADMIN_TOKEN" "$TEST_APPT_ID" > /dev/null
}

# ============================================================
# Sync Path Tests
# ============================================================
section "Sync: COMPLETED → VISITED"
test_sync_path "COMPLETED" "VISITED" "COMPLETED appointment syncs lead to VISITED"

section "Sync: NO_SHOW → LOST"
test_sync_path "NO_SHOW" "LOST" "NO_SHOW appointment syncs lead to LOST"

section "Sync: DNR → DNR"
test_sync_path "DNR" "DNR" "DNR appointment syncs lead to DNR"

section "Sync: TWC → TWC"
test_sync_path "TWC" "TWC" "TWC appointment syncs lead to TWC"

section "Sync: RESCHEDULED → RESCHEDULED"
# Reschedule is special: triggered by changing scheduledAt to a different time
# Use a unique future time with random minutes to avoid appointment conflicts
RANDOM_MIN=$(( (RANDOM % 50) + 1 ))
RANDOM_HOUR=$(( (RANDOM % 8) + 8 ))
RESCHEDULE_TIME="2026-06-$(printf '%02d' $(( (RANDOM % 28) + 1 )))T$(printf '%02d' $RANDOM_HOUR):$(printf '%02d' $RANDOM_MIN):00.000Z"
RESCHEDULE_BODY="{\"scheduledAt\":\"$RESCHEDULE_TIME\",\"notes\":\"Test reschedule\"}"

curl -s -X PATCH "$API_URL/appointments/$TEST_APPT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$RESCHEDULE_BODY" > /dev/null

RESCHEDULED_STATUS=$(get_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID")
assert_eq "Reschedule syncs lead to RESCHEDULED" "$RESCHEDULED_STATUS" "RESCHEDULED"

# Revert
revert_lead_to_booked "$ADMIN_TOKEN" "$TEST_LEAD_ID" > /dev/null
curl -s -X PATCH "$API_URL/appointments/$TEST_APPT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-03-10T10:00:00.000Z","status":"SCHEDULED"}' > /dev/null

# ============================================================
# Auto-refresh
# ============================================================
section "Auto-refresh in Frontend Bundle"

assert_bundle_contains "lastUpdatedText state" "$BUNDLE" "lastUpdatedText"
assert_bundle_contains "30s polling interval (3e4)" "$BUNDLE" "3e4"

section "Auto-refresh Hook Source"

if [ -f "$SCRIPT_DIR/../../frontend/src/hooks/useAutoRefresh.ts" ]; then
  record_test "useAutoRefresh.ts exists" "PASS"
else
  record_test "useAutoRefresh.ts exists" "FAIL" "file not found"
fi

if [ -f "$SCRIPT_DIR/../../frontend/src/components/LastUpdated.tsx" ]; then
  record_test "LastUpdated.tsx exists" "PASS"
else
  record_test "LastUpdated.tsx exists" "FAIL" "file not found"
fi

# Check auto-refresh is applied to key pages
for page in "LeadsPage.tsx" "AppointmentsPage.tsx" "StaffSummaryPage.tsx"; do
  if grep -q "useAutoRefresh" "$SCRIPT_DIR/../../frontend/src/pages/$page" 2>/dev/null; then
    record_test "useAutoRefresh applied to $page" "PASS"
  else
    record_test "useAutoRefresh applied to $page" "FAIL" "not imported"
  fi
done

if grep -q "useAutoRefresh" "$SCRIPT_DIR/../../frontend/src/components/StaffDashboard.tsx" 2>/dev/null; then
  record_test "useAutoRefresh applied to StaffDashboard" "PASS"
else
  record_test "useAutoRefresh applied to StaffDashboard" "FAIL" "not imported"
fi

print_summary "Story 4: Sync + Auto-refresh"
