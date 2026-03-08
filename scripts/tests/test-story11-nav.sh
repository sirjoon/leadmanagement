#!/bin/bash
# ============================================================
# Story 11: Responsive Navigation Test
# Tests: All routes, section headers, placeholder pages, SPA routing, role filtering
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 11: Responsive Navigation${NC}"
echo "Testing: Routes, sections, placeholders, SPA routing, role access"
echo "Target: $BASE_URL"
echo ""

BUNDLE=$(get_bundle_content)

section "Patient Journey Routes in Bundle"

for route in "/leads" "/appointments" "/visited" "/treatment" "/treatment-denied" "/follow-ups" "/dnr-dnc" "/lost"; do
  assert_bundle_contains "Route: $route" "$BUNDLE" "\"$route\""
done

section "Admin Routes in Bundle"

for route in "/reports" "/analytics" "/users" "/settings"; do
  assert_bundle_contains "Route: $route" "$BUNDLE" "\"$route\""
done

section "Navigation Section Headers"

assert_bundle_contains "Patient Journey section header" "$BUNDLE" '"Patient Journey"'
assert_bundle_contains "Tools section header" "$BUNDLE" '"Tools"'

section "Placeholder Pages"

PLACEHOLDER_TEXTS=("Lost Patients" "DNR / DNC" "Follow-ups" "Treatment Denied" "Visited Patients" "Treatment")
for text in "${PLACEHOLDER_TEXTS[@]}"; do
  assert_bundle_contains "Placeholder: $text" "$BUNDLE" "$text"
done

section "Placeholder Page Files"

for page in "VisitedPage.tsx" "TreatmentPage.tsx" "TreatmentDeniedPage.tsx" "FollowUpsPage.tsx" "DnrDncPage.tsx" "LostPage.tsx"; do
  if [ -f "$SCRIPT_DIR/../../frontend/src/pages/$page" ]; then
    record_test "Page file: $page" "PASS"
  else
    record_test "Page file: $page" "FAIL" "file not found"
  fi
done

section "SPA Routing (all routes return 200)"

for route in "/" "/visited" "/treatment" "/treatment-denied" "/follow-ups" "/dnr-dnc" "/lost" "/leads" "/settings"; do
  assert_http_status "SPA route $route returns 200" "$BASE_URL$route" "200"
done

section "Role-Based Access Logic"

# Check access types exist in Layout
if grep -q "lead_access" "$SCRIPT_DIR/../../frontend/src/components/Layout.tsx" 2>/dev/null; then
  record_test "lead_access nav type defined" "PASS"
else
  record_test "lead_access nav type defined" "FAIL" "not found in Layout.tsx"
fi

if grep -q "no_staff" "$SCRIPT_DIR/../../frontend/src/components/Layout.tsx" 2>/dev/null; then
  record_test "no_staff nav type defined" "PASS"
else
  record_test "no_staff nav type defined" "FAIL" "not found in Layout.tsx"
fi

# Check NoStaffRoute exists in App.tsx
if grep -q "NoStaffRoute" "$SCRIPT_DIR/../../frontend/src/App.tsx" 2>/dev/null; then
  record_test "NoStaffRoute component in App.tsx" "PASS"
else
  record_test "NoStaffRoute component in App.tsx" "FAIL" "not found"
fi

section "Compact Sidebar (w-56)"

if grep -q "w-56" "$SCRIPT_DIR/../../frontend/src/components/Layout.tsx" 2>/dev/null; then
  record_test "Sidebar width w-56 (compact)" "PASS"
else
  record_test "Sidebar width w-56 (compact)" "FAIL" "w-56 not found in Layout.tsx"
fi

print_summary "Story 11: Navigation"
