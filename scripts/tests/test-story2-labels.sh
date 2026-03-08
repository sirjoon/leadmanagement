#!/bin/bash
# ============================================================
# Story 2: Label Changes Test
# Tests: Completed→Visited, No Show→Lost, phone tel: links, ATTEMPTING removed
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 2: Label Changes${NC}"
echo "Testing: Visited/Lost labels, phone links, ATTEMPTING removal"
echo "Target: $BASE_URL"
echo ""

BUNDLE=$(get_bundle_content)

section "Visited / Lost Labels"

assert_bundle_contains "Visited label in bundle" "$BUNDLE" '"Visited"'
assert_bundle_contains "Lost label in bundle" "$BUNDLE" '"Lost"'

section "Phone Clickable (tel: links)"

TEL_COUNT=$(grep -o 'tel:\${' "$BUNDLE" | wc -l | tr -d ' ')
if [ "$TEL_COUNT" -gt 0 ]; then
  record_test "Phone tel: links exist ($TEL_COUNT occurrences)" "PASS"
else
  record_test "Phone tel: links exist" "FAIL" "no tel: links found"
fi

section "ATTEMPTING Removed from Quick Actions"

# Check ATTEMPTING is NOT in the adminStatuses or leadUserStatuses arrays
# These arrays define which statuses appear as quick action buttons
LEADCARD="$SCRIPT_DIR/../../frontend/src/components/LeadCard.tsx"

# Extract the adminStatuses and leadUserStatuses array definitions and check for ATTEMPTING
ADMIN_ARRAY=$(sed -n '/^const adminStatuses/,/];/p' "$LEADCARD" 2>/dev/null || true)
LEAD_ARRAY=$(sed -n '/^const leadUserStatuses/,/];/p' "$LEADCARD" 2>/dev/null || true)

ADMIN_HAS_ATTEMPTING=$(echo "$ADMIN_ARRAY" | grep "ATTEMPTING" || true)
LEAD_HAS_ATTEMPTING=$(echo "$LEAD_ARRAY" | grep "ATTEMPTING" || true)

if [ -z "$ADMIN_HAS_ATTEMPTING" ] && [ -z "$LEAD_HAS_ATTEMPTING" ]; then
  record_test "ATTEMPTING not in quick action arrays" "PASS"
else
  record_test "ATTEMPTING not in quick action arrays" "FAIL" "found in status arrays"
fi

# Verify ATTEMPTING still exists in display configs (backward compat)
if grep -q "ATTEMPTING" "$LEADCARD" 2>/dev/null; then
  record_test "ATTEMPTING still in display configs (backward compat)" "PASS"
else
  record_test "ATTEMPTING still in display configs (backward compat)" "SKIP" "removed entirely"
fi

section "Staff Dashboard Labels"

# Check StaffDashboard source for label changes
STAFF_VISITED=$(grep -c '"Visited"' "$SCRIPT_DIR/../../frontend/src/components/StaffDashboard.tsx" 2>/dev/null || echo "0")
STAFF_LOST=$(grep -c '"Lost"' "$SCRIPT_DIR/../../frontend/src/components/StaffDashboard.tsx" 2>/dev/null || echo "0")

if [ "$STAFF_VISITED" -gt 0 ]; then
  record_test "StaffDashboard uses Visited label" "PASS"
else
  record_test "StaffDashboard uses Visited label" "FAIL" "Visited not found"
fi

if [ "$STAFF_LOST" -gt 0 ]; then
  record_test "StaffDashboard uses Lost label" "PASS"
else
  record_test "StaffDashboard uses Lost label" "FAIL" "Lost not found"
fi

print_summary "Story 2: Labels"
