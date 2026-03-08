#!/bin/bash
# ============================================================
# MagicCRM Test Helpers
# Shared functions for all regression test scripts
# ============================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Counters
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TEST_RESULTS=()

# Environment (default to dev)
ENV="${TEST_ENV:-dev}"
if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
  BASE_URL="https://magiccrm.geekzlabs.com"
else
  BASE_URL="https://dev.magiccrm.geekzlabs.com"
fi
API_URL="$BASE_URL/api/v1"

# Tenant
TENANT_ID="avmsmiles"

# Test accounts
ADMIN_EMAIL="admin@avmsmiles.in"
LEAD_EMAIL="lead@avmsmiles.in"
STAFF_EMAIL="staff.rs-puram@avmsmiles.in"
PASSWORD="admin123"

# Known test lead (Bala - APPOINTMENT_BOOKED with appointment)
# These IDs are for dev environment. Override if different.
TEST_LEAD_ID="${TEST_LEAD_ID:-}"
TEST_APPT_ID="${TEST_APPT_ID:-}"

# ============================================================
# Functions
# ============================================================

login() {
  local email="$1"
  local result=$(curl -s "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")
  echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}

get_admin_token() {
  login "$ADMIN_EMAIL"
}

get_lead_token() {
  login "$LEAD_EMAIL"
}

get_staff_token() {
  login "$STAFF_EMAIL"
}

# Get JSON field from response
json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Navigate nested paths like 'lead.status'
parts = '$field'.split('.')
obj = data
for p in parts:
    if isinstance(obj, dict):
        obj = obj.get(p)
    else:
        obj = None
        break
print(obj if obj is not None else '')
" 2>/dev/null
}

# Record test result
record_test() {
  local name="$1"
  local status="$2" # PASS, FAIL, SKIP
  local details="${3:-}"

  if [ "$status" = "PASS" ]; then
    echo -e "  ${GREEN}PASS${NC} $name"
    ((PASS_COUNT++))
  elif [ "$status" = "FAIL" ]; then
    echo -e "  ${RED}FAIL${NC} $name ${RED}($details)${NC}"
    ((FAIL_COUNT++))
  else
    echo -e "  ${YELLOW}SKIP${NC} $name ($details)"
    ((SKIP_COUNT++))
  fi
  TEST_RESULTS+=("$status|$name|$details")
}

# Assert equals
assert_eq() {
  local test_name="$1"
  local actual="$2"
  local expected="$3"

  if [ "$actual" = "$expected" ]; then
    record_test "$test_name" "PASS"
  else
    record_test "$test_name" "FAIL" "expected=$expected, got=$actual"
  fi
}

# Assert not empty
assert_not_empty() {
  local test_name="$1"
  local actual="$2"

  if [ -n "$actual" ] && [ "$actual" != "None" ] && [ "$actual" != "" ]; then
    record_test "$test_name" "PASS"
  else
    record_test "$test_name" "FAIL" "value is empty"
  fi
}

# Assert contains (for checking bundle content)
# $2 = path to bundle file (from get_bundle_content)
# $3 = text to search for
assert_bundle_contains() {
  local test_name="$1"
  local bundle_file="$2"
  local search_text="$3"

  if grep -q "$search_text" "$bundle_file" 2>/dev/null; then
    record_test "$test_name" "PASS"
  else
    record_test "$test_name" "FAIL" "not found in bundle: $search_text"
  fi
}

# Assert HTTP status code
assert_http_status() {
  local test_name="$1"
  local url="$2"
  local expected_code="$3"
  local auth_header="${4:-}"

  local actual_code
  if [ -n "$auth_header" ]; then
    actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" -H "Authorization: Bearer $auth_header")
  else
    actual_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi
  assert_eq "$test_name" "$actual_code" "$expected_code"
}

# Find a lead with specific status
find_lead_by_status() {
  local token="$1"
  local status="$2"
  curl -s "$API_URL/leads?status=$status&limit=1" -H "Authorization: Bearer $token" | python3 -c "
import sys, json
data = json.load(sys.stdin)
leads = data.get('leads', data.get('data', []))
if leads:
    print(leads[0]['id'])
" 2>/dev/null
}

# Find appointment for a lead
find_appointment_for_lead() {
  local token="$1"
  local lead_id="$2"
  curl -s "$API_URL/appointments?leadId=$lead_id" -H "Authorization: Bearer $token" | python3 -c "
import sys, json
data = json.load(sys.stdin)
appts = data.get('appointments', data.get('data', []))
if appts:
    print(appts[0]['id'])
" 2>/dev/null
}

# Update lead status
update_lead_status() {
  local token="$1"
  local lead_id="$2"
  local status="$3"
  local extra_fields="${4:-}"

  local body="{\"status\":\"$status\""
  if [ -n "$extra_fields" ]; then
    body="$body,$extra_fields"
  fi
  body="$body}"

  curl -s -X PATCH "$API_URL/leads/$lead_id" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# Update appointment status
update_appointment_status() {
  local token="$1"
  local appt_id="$2"
  local status="$3"

  curl -s -X PATCH "$API_URL/appointments/$appt_id" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"$status\"}"
}

# Revert lead to APPOINTMENT_BOOKED with followUpDate
revert_lead_to_booked() {
  local token="$1"
  local lead_id="$2"
  update_lead_status "$token" "$lead_id" "APPOINTMENT_BOOKED" "\"followUpDate\":\"2026-03-10T10:00:00.000Z\""
}

# Revert appointment to SCHEDULED
revert_appointment_to_scheduled() {
  local token="$1"
  local appt_id="$2"
  update_appointment_status "$token" "$appt_id" "SCHEDULED"
}

# Get lead status
get_lead_status() {
  local token="$1"
  local lead_id="$2"
  local response=$(curl -s "$API_URL/leads/$lead_id" -H "Authorization: Bearer $token")
  json_field "$response" "lead.status"
}

# Get frontend JS bundle content (cached to temp file for session)
# Uses a stable filename derived from the bundle hash so multiple scripts share the cache
BUNDLE_CACHE_FILE=""
get_bundle_content() {
  if [ -z "$BUNDLE_CACHE_FILE" ] || [ ! -f "$BUNDLE_CACHE_FILE" ]; then
    local bundle_path=$(curl -s "$BASE_URL/" | grep -o '/assets/index-[^"]*\.js')
    local bundle_name=$(echo "$bundle_path" | sed 's/\/assets\///' | sed 's/\.js//')
    BUNDLE_CACHE_FILE="/tmp/magiccrm-bundle-${bundle_name}.js"
    if [ ! -f "$BUNDLE_CACHE_FILE" ]; then
      curl -s "$BASE_URL$bundle_path" > "$BUNDLE_CACHE_FILE"
    fi
  fi
  echo "$BUNDLE_CACHE_FILE"
}

# Print test summary
print_summary() {
  local suite_name="$1"
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  $suite_name - Test Summary${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}Passed: $PASS_COUNT${NC}"
  echo -e "  ${RED}Failed: $FAIL_COUNT${NC}"
  echo -e "  ${YELLOW}Skipped: $SKIP_COUNT${NC}"
  echo -e "  Total:  $((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))"
  echo -e "${BOLD}═══════════════════════════════════════════════${NC}"

  if [ $FAIL_COUNT -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}  Failed Tests:${NC}"
    for result in "${TEST_RESULTS[@]}"; do
      IFS='|' read -r status name details <<< "$result"
      if [ "$status" = "FAIL" ]; then
        echo -e "  ${RED}FAIL${NC} $name ($details)"
      fi
    done
    echo ""
  fi

  if [ $FAIL_COUNT -gt 0 ]; then
    return 1
  fi
  return 0
}

# Section header
section() {
  echo ""
  echo -e "${CYAN}${BOLD}── $1 ──${NC}"
}

# Resolve test lead and appointment IDs
resolve_test_data() {
  local token="$1"

  if [ -z "$TEST_LEAD_ID" ]; then
    TEST_LEAD_ID=$(find_lead_by_status "$token" "APPOINTMENT_BOOKED")
  fi
  if [ -z "$TEST_LEAD_ID" ]; then
    echo -e "${RED}ERROR: No APPOINTMENT_BOOKED lead found for testing${NC}"
    return 1
  fi

  if [ -z "$TEST_APPT_ID" ]; then
    TEST_APPT_ID=$(find_appointment_for_lead "$token" "$TEST_LEAD_ID")
  fi
  if [ -z "$TEST_APPT_ID" ]; then
    echo -e "${RED}ERROR: No appointment found for test lead $TEST_LEAD_ID${NC}"
    return 1
  fi

  echo "  Test lead: $TEST_LEAD_ID"
  echo "  Test appointment: $TEST_APPT_ID"
}
