#!/bin/bash
# ============================================================
# Story 1: Schema Changes Test
# Tests: lastContactedAt, followUp, followUpDate, TREATMENT_DENIED
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Story 1: Schema Changes${NC}"
echo "Testing: lastContactedAt, followUp, followUpDate, TREATMENT_DENIED status"
echo "Target: $BASE_URL"
echo ""

# Get admin token
ADMIN_TOKEN=$(get_admin_token)
assert_not_empty "Admin login" "$ADMIN_TOKEN"

section "Schema Fields in Lead Response"

# Get a lead and check fields exist
LEAD_RESPONSE=$(curl -s "$API_URL/leads?limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
LEAD_KEYS=$(echo "$LEAD_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
leads = data.get('leads', data.get('data', []))
if leads:
    print(' '.join(sorted(leads[0].keys())))
" 2>/dev/null)

# Check each schema field exists in response
if echo "$LEAD_KEYS" | grep -q "lastContactedAt"; then
  record_test "lastContactedAt field exists" "PASS"
else
  record_test "lastContactedAt field exists" "FAIL" "field not in response keys"
fi

if echo "$LEAD_KEYS" | grep -q "followUp"; then
  record_test "followUp field exists" "PASS"
else
  record_test "followUp field exists" "FAIL" "field not in response keys"
fi

if echo "$LEAD_KEYS" | grep -q "followUpDate"; then
  record_test "followUpDate field exists" "PASS"
else
  record_test "followUpDate field exists" "FAIL" "field not in response keys"
fi

section "TREATMENT_DENIED Status"

# Query with TREATMENT_DENIED status (should not error)
TD_RESPONSE=$(curl -s "$API_URL/leads?status=TREATMENT_DENIED" -H "Authorization: Bearer $ADMIN_TOKEN")
TD_ERROR=$(json_field "$TD_RESPONSE" "error")
if [ -z "$TD_ERROR" ]; then
  record_test "TREATMENT_DENIED is a valid status filter" "PASS"
else
  record_test "TREATMENT_DENIED is a valid status filter" "FAIL" "error: $TD_ERROR"
fi

section "All Lead Statuses in Database"

# Check what statuses exist
ALL_STATUSES=$(curl -s "$API_URL/leads?limit=200" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
leads = data.get('leads', data.get('data', []))
statuses = set()
for lead in leads:
    statuses.add(lead.get('status','?'))
print(' '.join(sorted(statuses)))
" 2>/dev/null)
echo "  Statuses found: $ALL_STATUSES"

# Verify core statuses exist
for status in "APPOINTMENT_BOOKED" "CONNECTED" "DNR" "NEW"; do
  if echo "$ALL_STATUSES" | grep -q "$status"; then
    record_test "Status $status exists in data" "PASS"
  else
    record_test "Status $status exists in data" "SKIP" "no leads with this status currently"
  fi
done

print_summary "Story 1: Schema"
