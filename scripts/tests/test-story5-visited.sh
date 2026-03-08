#!/bin/bash
# ============================================================
# Story 5: Visited Tab Test
# Tests: Backend access (3 roles), patient journey status gating,
#        status transitions, follow-up, treatment plan, staff field
#        restrictions, frontend bundle, PatientCard, ScheduleModal
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 5: Visited Tab${NC}"
echo "Testing: Role access, status transitions, frontend components"
echo "Target: $BASE_URL"
echo ""

ADMIN_TOKEN=$(get_admin_token)
LEAD_TOKEN=$(get_lead_token)
STAFF_TOKEN=$(get_staff_token)
BUNDLE=$(get_bundle_content)

# ============================================================
# Backend: Patient Journey Status Gating
# ============================================================
section "Clinic Staff: Patient Journey Access"

PATIENT_JOURNEY_STATUSES=("VISITED" "TREATMENT_STARTED" "TREATMENT_DENIED" "LOST" "DNR" "DNC" "TWC")
BLOCKED_STATUSES=("NEW" "ATTEMPTING" "CONNECTED" "APPOINTMENT_BOOKED")

for status in "${PATIENT_JOURNEY_STATUSES[@]}"; do
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?status=$status&limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
  assert_eq "Staff can access status=$status" "$HTTP_CODE" "200"
done

for status in "${BLOCKED_STATUSES[@]}"; do
  HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?status=$status&limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
  assert_eq "Staff blocked from status=$status" "$HTTP_CODE" "403"
done

# Staff without status filter = blocked
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
assert_eq "Staff blocked without status filter" "$HTTP_CODE" "403"

# ============================================================
# Backend: All Roles Can Access VISITED
# ============================================================
section "All Roles: VISITED Access"

ADMIN_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?status=VISITED&limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "Admin can access VISITED leads" "$ADMIN_CODE" "200"

LEAD_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?status=VISITED&limit=1" -H "Authorization: Bearer $LEAD_TOKEN")
assert_eq "Lead User can access VISITED leads" "$LEAD_CODE" "200"

STAFF_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$API_URL/leads?status=VISITED&limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
assert_eq "Staff can access VISITED leads" "$STAFF_CODE" "200"

# ============================================================
# Backend: Status Transitions from VISITED
# ============================================================
section "Status Transitions from VISITED"

# Find or create a VISITED lead for testing
VISITED_LEAD_ID=$(curl -sk "$API_URL/leads?status=VISITED&limit=1" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); leads=d.get('leads',[]); print(leads[0]['id'] if leads else '')" 2>/dev/null)

if [ -z "$VISITED_LEAD_ID" ]; then
  record_test "Found VISITED lead for testing" "SKIP" "no VISITED leads in dev DB"
else
  record_test "Found VISITED lead: ${VISITED_LEAD_ID:0:12}..." "PASS"

  # VISITED → TREATMENT_DENIED
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"TREATMENT_DENIED"}')
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lead',{}).get('status',''))" 2>/dev/null)
  assert_eq "VISITED → TREATMENT_DENIED" "$STATUS" "TREATMENT_DENIED"

  # Revert
  curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"VISITED","followUpDate":"2026-04-01T10:00:00.000Z"}' > /dev/null 2>&1

  # VISITED → DNR
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"DNR"}')
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lead',{}).get('status',''))" 2>/dev/null)
  assert_eq "VISITED → DNR" "$STATUS" "DNR"

  # Revert
  curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"VISITED","followUpDate":"2026-04-01T10:00:00.000Z"}' > /dev/null 2>&1

  # VISITED → LOST
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"LOST","followUpDate":"2026-04-01T10:00:00.000Z"}')
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lead',{}).get('status',''))" 2>/dev/null)
  assert_eq "VISITED → LOST" "$STATUS" "LOST"

  # Revert
  curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"status":"VISITED","followUpDate":"2026-04-01T10:00:00.000Z"}' > /dev/null 2>&1

  # Follow-up toggle
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"followUp":true,"followUpDate":"2026-04-15T10:00:00.000Z"}')
  FOLLOW_UP=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lead',{}).get('followUp',''))" 2>/dev/null)
  assert_eq "Follow-up toggle on VISITED lead" "$FOLLOW_UP" "True"

  # Treatment plan update
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$VISITED_LEAD_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"treatmentPlan":"Test plan from Story 5","treatmentNotes":"Test notes"}')
  PLAN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lead',{}).get('treatmentPlan',''))" 2>/dev/null)
  assert_eq "Treatment plan update" "$PLAN" "Test plan from Story 5"
fi

# ============================================================
# Backend: Staff Field Restrictions on PATCH
# ============================================================
section "Staff Field Restrictions"

# Find a VISITED lead from the staff user's own clinic (rs-puram)
STAFF_VISITED_ID=$(curl -sk "$API_URL/leads?status=VISITED&limit=1" -H "Authorization: Bearer $STAFF_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); leads=d.get('leads',[]); print(leads[0]['id'] if leads else '')" 2>/dev/null)

if [ -n "$STAFF_VISITED_ID" ]; then
  # Staff can update allowed fields (treatmentNotes)
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$STAFF_VISITED_ID" \
    -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
    -d '{"treatmentNotes":"Staff note test"}')
  STAFF_ERROR=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  if [ -z "$STAFF_ERROR" ]; then
    record_test "Staff can update treatmentNotes" "PASS"
  else
    record_test "Staff can update treatmentNotes" "FAIL" "$STAFF_ERROR"
  fi

  # Staff cannot update restricted fields (name, phone, priority)
  RESP=$(curl -sk -X PATCH "$API_URL/leads/$STAFF_VISITED_ID" \
    -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
    -d '{"name":"Should Fail"}')
  STAFF_ERROR=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  if [ -n "$STAFF_ERROR" ]; then
    record_test "Staff blocked from updating name" "PASS"
  else
    record_test "Staff blocked from updating name" "FAIL" "no error returned"
  fi
else
  record_test "Staff can update treatmentNotes" "SKIP" "no VISITED leads in staff's clinic"
  record_test "Staff blocked from updating name" "SKIP" "no VISITED leads in staff's clinic"
fi

# ============================================================
# Frontend: Component Files
# ============================================================
section "Frontend Component Files"

for component in "PatientCard.tsx" "ScheduleAppointmentModal.tsx" "DNRConfirmDialog.tsx"; do
  if [ -f "$SCRIPT_DIR/../../frontend/src/components/$component" ]; then
    record_test "$component exists" "PASS"
  else
    record_test "$component exists" "FAIL" "file not found"
  fi
done

if [ -f "$SCRIPT_DIR/../../frontend/src/pages/VisitedPage.tsx" ]; then
  LINES=$(wc -l < "$SCRIPT_DIR/../../frontend/src/pages/VisitedPage.tsx" | tr -d ' ')
  if [ "$LINES" -gt 50 ]; then
    record_test "VisitedPage.tsx is implemented ($LINES lines)" "PASS"
  else
    record_test "VisitedPage.tsx is implemented" "FAIL" "only $LINES lines (placeholder?)"
  fi
else
  record_test "VisitedPage.tsx exists" "FAIL" "file not found"
fi

# ============================================================
# Frontend: Bundle Content
# ============================================================
section "Frontend Bundle: Visited Tab Content"

assert_bundle_contains "Visited Patients title" "$BUNDLE" "Visited Patients"
assert_bundle_contains "Agrees Treatment button" "$BUNDLE" "Agrees Treatment"
assert_bundle_contains "Denies Treatment button" "$BUNDLE" "Denies Treatment"
assert_bundle_contains "Schedule Treatment text" "$BUNDLE" "Schedule"
assert_bundle_contains "Treatment Plan label" "$BUNDLE" "Treatment Plan"
assert_bundle_contains "Treatment Notes label" "$BUNDLE" "Treatment Notes"

# ============================================================
# Frontend: SPA Route
# ============================================================
section "SPA Routing"

assert_http_status "GET /visited returns 200" "$BASE_URL/visited" "200"

# ============================================================
# Frontend: Source Code Patterns
# ============================================================
section "Source Code Patterns"

VISITED_PAGE="$SCRIPT_DIR/../../frontend/src/pages/VisitedPage.tsx"
PATIENT_CARD="$SCRIPT_DIR/../../frontend/src/components/PatientCard.tsx"

if grep -q "useAutoRefresh" "$VISITED_PAGE" 2>/dev/null; then
  record_test "VisitedPage uses useAutoRefresh" "PASS"
else
  record_test "VisitedPage uses useAutoRefresh" "FAIL" "not imported"
fi

if grep -q "PatientCard" "$VISITED_PAGE" 2>/dev/null; then
  record_test "VisitedPage uses PatientCard" "PASS"
else
  record_test "VisitedPage uses PatientCard" "FAIL" "not imported"
fi

if grep -q "ScheduleAppointmentModal" "$VISITED_PAGE" 2>/dev/null; then
  record_test "VisitedPage uses ScheduleAppointmentModal" "PASS"
else
  record_test "VisitedPage uses ScheduleAppointmentModal" "FAIL" "not imported"
fi

if grep -q "DNRConfirmDialog" "$PATIENT_CARD" 2>/dev/null; then
  record_test "PatientCard uses DNRConfirmDialog" "PASS"
else
  record_test "PatientCard uses DNRConfirmDialog" "FAIL" "not imported"
fi

if grep -q 'tel:' "$PATIENT_CARD" 2>/dev/null; then
  record_test "PatientCard has tel: links" "PASS"
else
  record_test "PatientCard has tel: links" "FAIL" "no tel: links"
fi

if grep -q "NoteThread" "$PATIENT_CARD" 2>/dev/null; then
  record_test "PatientCard includes NoteThread" "PASS"
else
  record_test "PatientCard includes NoteThread" "FAIL" "not imported"
fi

print_summary "Story 5: Visited Tab"
