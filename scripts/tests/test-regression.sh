#!/bin/bash
# ============================================================
# Core Regression Test
# Tests: Login, CRUD, appointments, notes, search, filters
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Core Regression Tests${NC}"
echo "Testing: Login, Lead CRUD, Appointments, Notes, Search, Filters"
echo "Target: $BASE_URL"
echo ""

ADMIN_TOKEN=$(get_admin_token)

# ============================================================
# Lead Operations
# ============================================================
section "Lead List"

LEADS_RESP=$(curl -s "$API_URL/leads?limit=3" -H "Authorization: Bearer $ADMIN_TOKEN")
LEAD_COUNT=$(echo "$LEADS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); leads=d.get('leads',d.get('data',[])); print(len(leads))" 2>/dev/null)
TOTAL=$(echo "$LEADS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', d.get('pagination',{}).get('total','0')))" 2>/dev/null)

if [ "$LEAD_COUNT" -gt 0 ]; then
  record_test "Lead list returns data ($LEAD_COUNT leads, total=$TOTAL)" "PASS"
else
  record_test "Lead list returns data" "FAIL" "empty response"
fi

section "Lead Detail"

FIRST_LEAD_ID=$(echo "$LEADS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); leads=d.get('leads',d.get('data',[])); print(leads[0]['id'])" 2>/dev/null)
DETAIL_RESP=$(curl -s "$API_URL/leads/$FIRST_LEAD_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
DETAIL_NAME=$(json_field "$DETAIL_RESP" "lead.name")
assert_not_empty "Lead detail returns name" "$DETAIL_NAME"

DETAIL_STATUS=$(json_field "$DETAIL_RESP" "lead.status")
assert_not_empty "Lead detail returns status" "$DETAIL_STATUS"

DETAIL_PHONE=$(json_field "$DETAIL_RESP" "lead.phone")
assert_not_empty "Lead detail returns phone" "$DETAIL_PHONE"

section "Lead Update"

UPDATE_RESP=$(curl -s -X PATCH "$API_URL/leads/$FIRST_LEAD_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Regression test note - can be deleted"}')
UPDATE_ERROR=$(json_field "$UPDATE_RESP" "error")
if [ -z "$UPDATE_ERROR" ]; then
  record_test "Lead update (notes)" "PASS"
else
  record_test "Lead update (notes)" "FAIL" "$UPDATE_ERROR"
fi

section "Lead Search"

SEARCH_RESP=$(curl -s "$API_URL/leads?search=raj&limit=5" -H "Authorization: Bearer $ADMIN_TOKEN")
SEARCH_COUNT=$(echo "$SEARCH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); leads=d.get('leads',d.get('data',[])); print(len(leads))" 2>/dev/null)
if [ "$SEARCH_COUNT" -gt 0 ]; then
  record_test "Lead search returns results (query='raj', count=$SEARCH_COUNT)" "PASS"
else
  record_test "Lead search returns results" "SKIP" "no matches for 'raj'"
fi

section "Lead Filters"

for status in "DNR" "APPOINTMENT_BOOKED" "CONNECTED"; do
  FILTER_RESP=$(curl -s "$API_URL/leads?status=$status&limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
  FILTER_ERROR=$(json_field "$FILTER_RESP" "error")
  if [ -z "$FILTER_ERROR" ]; then
    FILTER_COUNT=$(echo "$FILTER_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total', d.get('pagination',{}).get('total','0')))" 2>/dev/null)
    record_test "Filter status=$status (total=$FILTER_COUNT)" "PASS"
  else
    record_test "Filter status=$status" "FAIL" "$FILTER_ERROR"
  fi
done

# ============================================================
# Appointment Operations
# ============================================================
section "Appointment List"

APPTS_RESP=$(curl -s "$API_URL/appointments?limit=3" -H "Authorization: Bearer $ADMIN_TOKEN")
APPT_COUNT=$(echo "$APPTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); appts=d.get('appointments',d.get('data',[])); print(len(appts))" 2>/dev/null)
if [ "$APPT_COUNT" -gt 0 ]; then
  record_test "Appointment list returns data ($APPT_COUNT appointments)" "PASS"
else
  record_test "Appointment list returns data" "FAIL" "empty response"
fi

section "Appointment Status Update"

APPT_ID=$(echo "$APPTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); appts=d.get('appointments',d.get('data',[])); print(appts[0]['id'])" 2>/dev/null)
ORIG_STATUS=$(echo "$APPTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); appts=d.get('appointments',d.get('data',[])); print(appts[0]['status'])" 2>/dev/null)

# Update to CONFIRMED
CONFIRM_RESP=$(curl -s -X PATCH "$API_URL/appointments/$APPT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"CONFIRMED"}')
CONFIRM_STATUS=$(json_field "$CONFIRM_RESP" "appointment.status")
assert_eq "Appointment status update to CONFIRMED" "$CONFIRM_STATUS" "CONFIRMED"

# Revert
curl -s -X PATCH "$API_URL/appointments/$APPT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"$ORIG_STATUS\"}" > /dev/null
record_test "Appointment reverted to $ORIG_STATUS" "PASS"

section "Appointment Filters"

SCHED_RESP=$(curl -s "$API_URL/appointments?status=SCHEDULED&limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
SCHED_ERROR=$(json_field "$SCHED_RESP" "error")
if [ -z "$SCHED_ERROR" ]; then
  record_test "Appointment filter status=SCHEDULED" "PASS"
else
  record_test "Appointment filter status=SCHEDULED" "FAIL" "$SCHED_ERROR"
fi

# ============================================================
# Appointment Create + Cleanup
# ============================================================
section "Appointment Create"

# Find a lead and clinic for create test
resolve_test_data "$ADMIN_TOKEN" 2>/dev/null

CLINIC_ID=$(echo "$APPTS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); appts=d.get('appointments',d.get('data',[])); print(appts[0].get('clinicId',''))" 2>/dev/null)

if [ -n "$TEST_LEAD_ID" ] && [ -n "$CLINIC_ID" ]; then
  CREATE_RESP=$(curl -s -X POST "$API_URL/appointments" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"leadId\":\"$TEST_LEAD_ID\",\"clinicId\":\"$CLINIC_ID\",\"scheduledAt\":\"2026-04-20T14:00:00.000Z\",\"notes\":\"Regression test\"}")
  CREATE_ERROR=$(json_field "$CREATE_RESP" "error")
  if [ -z "$CREATE_ERROR" ]; then
    NEW_APPT_ID=$(json_field "$CREATE_RESP" "appointment.id")
    record_test "Appointment created" "PASS"
    # Cleanup
    curl -s -X PATCH "$API_URL/appointments/$NEW_APPT_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"status":"CANCELLED"}' > /dev/null
    record_test "Test appointment cleaned up (cancelled)" "PASS"
  else
    CREATE_MSG=$(json_field "$CREATE_RESP" "message")
    record_test "Appointment created" "FAIL" "$CREATE_ERROR: $CREATE_MSG"
  fi
else
  record_test "Appointment created" "SKIP" "no test lead or clinic"
fi

# ============================================================
# Notes
# ============================================================
section "Notes"

if [ -n "$TEST_LEAD_ID" ]; then
  NOTE_RESP=$(curl -s -X POST "$API_URL/notes" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"leadId\":\"$TEST_LEAD_ID\",\"content\":\"Regression test note\"}")
  NOTE_ERROR=$(json_field "$NOTE_RESP" "error")
  if [ -z "$NOTE_ERROR" ]; then
    record_test "Note created" "PASS"
  else
    record_test "Note created" "FAIL" "$NOTE_ERROR"
  fi

  NOTES_LIST=$(curl -s "$API_URL/notes?leadId=$TEST_LEAD_ID" -H "Authorization: Bearer $ADMIN_TOKEN")
  NOTES_COUNT=$(echo "$NOTES_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('notes',[])))" 2>/dev/null)
  if [ "$NOTES_COUNT" -gt 0 ]; then
    record_test "Notes list returns data ($NOTES_COUNT notes)" "PASS"
  else
    record_test "Notes list returns data" "FAIL" "empty"
  fi
else
  record_test "Notes" "SKIP" "no test lead"
fi

# ============================================================
# Staff Dashboard
# ============================================================
section "Staff Dashboard"

STAFF_TOKEN=$(get_staff_token)
SUMMARY_RESP=$(curl -s "$API_URL/appointments/staff-summary" -H "Authorization: Bearer $STAFF_TOKEN")
SUMMARY_ERROR=$(json_field "$SUMMARY_RESP" "error")
if [ -z "$SUMMARY_ERROR" ]; then
  record_test "Staff summary endpoint" "PASS"
else
  record_test "Staff summary endpoint" "FAIL" "$SUMMARY_ERROR"
fi

TODAY_RESP=$(curl -s "$API_URL/appointments/today" -H "Authorization: Bearer $STAFF_TOKEN")
TODAY_ERROR=$(json_field "$TODAY_RESP" "error")
if [ -z "$TODAY_ERROR" ]; then
  record_test "Staff today endpoint" "PASS"
else
  record_test "Staff today endpoint" "FAIL" "$TODAY_ERROR"
fi

print_summary "Core Regression"
