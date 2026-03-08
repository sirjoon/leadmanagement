#!/bin/bash
# ============================================================
# Story 3: DNR Confirmation Dialog Test
# Tests: Dialog component in bundle, DNR status change API roundtrip
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 3: DNR Confirmation Dialog${NC}"
echo "Testing: DNR dialog in bundle, DNR status change roundtrip"
echo "Target: $BASE_URL"
echo ""

BUNDLE=$(get_bundle_content)
ADMIN_TOKEN=$(get_admin_token)

section "DNR Dialog in Frontend Bundle"

assert_bundle_contains "Dialog title: Move to DNR" "$BUNDLE" "Move to DNR"
assert_bundle_contains "Confirm button: Yes, Move to DNR" "$BUNDLE" "Yes, Move to DNR"
assert_bundle_contains "Cancel button: No, Go Back" "$BUNDLE" "No, Go Back"

section "DNR Dialog Integration"

# Check DNRConfirmDialog component exists
if [ -f "$SCRIPT_DIR/../../frontend/src/components/DNRConfirmDialog.tsx" ]; then
  record_test "DNRConfirmDialog.tsx exists" "PASS"
else
  record_test "DNRConfirmDialog.tsx exists" "FAIL" "file not found"
fi

# Check it's imported in LeadCard
if grep -q "DNRConfirmDialog" "$SCRIPT_DIR/../../frontend/src/components/LeadCard.tsx" 2>/dev/null; then
  record_test "DNRConfirmDialog imported in LeadCard" "PASS"
else
  record_test "DNRConfirmDialog imported in LeadCard" "FAIL" "not imported"
fi

# Check it's imported in StaffDashboard
if grep -q "DNRConfirmDialog" "$SCRIPT_DIR/../../frontend/src/components/StaffDashboard.tsx" 2>/dev/null; then
  record_test "DNRConfirmDialog imported in StaffDashboard" "PASS"
else
  record_test "DNRConfirmDialog imported in StaffDashboard" "FAIL" "not imported"
fi

section "DNR Status Change API Roundtrip"

# Find a test lead
resolve_test_data "$ADMIN_TOKEN" || exit 1

# Change lead to DNR
ORIGINAL_STATUS=$(get_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID")
echo "  Original status: $ORIGINAL_STATUS"

DNR_RESULT=$(update_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID" "DNR")
DNR_STATUS=$(json_field "$DNR_RESULT" "lead.status")
assert_eq "Lead status changed to DNR" "$DNR_STATUS" "DNR"

# Verify via separate GET
VERIFY_STATUS=$(get_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID")
assert_eq "DNR verified via GET" "$VERIFY_STATUS" "DNR"

# Revert
echo "  Reverting..."
revert_lead_to_booked "$ADMIN_TOKEN" "$TEST_LEAD_ID" > /dev/null
REVERT_STATUS=$(get_lead_status "$ADMIN_TOKEN" "$TEST_LEAD_ID")
assert_eq "Lead reverted to APPOINTMENT_BOOKED" "$REVERT_STATUS" "APPOINTMENT_BOOKED"

print_summary "Story 3: DNR Dialog"
