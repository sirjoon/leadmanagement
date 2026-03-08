#!/bin/bash
# ============================================================
# Role-Based Access Test
# Tests: Admin, Lead User, Clinic Staff access to all endpoints
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Role-Based Access Tests${NC}"
echo "Testing: 3 roles x multiple endpoints"
echo "Target: $BASE_URL"
echo ""

section "Login All Roles"

ADMIN_TOKEN=$(get_admin_token)
assert_not_empty "Admin login succeeds" "$ADMIN_TOKEN"

LEAD_TOKEN=$(get_lead_token)
assert_not_empty "Lead User login succeeds" "$LEAD_TOKEN"

STAFF_TOKEN=$(get_staff_token)
assert_not_empty "Clinic Staff login succeeds" "$STAFF_TOKEN"

# Verify roles
ADMIN_ROLE=$(curl -s "$API_URL/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('role', d.get('user',{}).get('role','')))" 2>/dev/null)
LEAD_ROLE=$(curl -s "$API_URL/auth/me" -H "Authorization: Bearer $LEAD_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('role', d.get('user',{}).get('role','')))" 2>/dev/null)
STAFF_ROLE=$(curl -s "$API_URL/auth/me" -H "Authorization: Bearer $STAFF_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('role', d.get('user',{}).get('role','')))" 2>/dev/null)

assert_eq "Admin role is ADMIN" "$ADMIN_ROLE" "ADMIN"
assert_eq "Lead role is LEAD_USER" "$LEAD_ROLE" "LEAD_USER"
assert_eq "Staff role is CLINIC_STAFF" "$STAFF_ROLE" "CLINIC_STAFF"

# ============================================================
# Leads Access
# ============================================================
section "Leads Access"

# Admin - should access leads
ADMIN_LEADS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/leads?limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "Admin can access leads" "$ADMIN_LEADS" "200"

# Lead User - should access leads
LEAD_LEADS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/leads?limit=1" -H "Authorization: Bearer $LEAD_TOKEN")
assert_eq "Lead User can access leads" "$LEAD_LEADS" "200"

# Staff - should be BLOCKED from leads
STAFF_LEADS=$(curl -s "$API_URL/leads?limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
STAFF_LEADS_ERROR=$(json_field "$STAFF_LEADS" "error")
if [ -n "$STAFF_LEADS_ERROR" ]; then
  record_test "Staff BLOCKED from leads" "PASS"
else
  record_test "Staff BLOCKED from leads" "FAIL" "no error returned"
fi

# ============================================================
# Appointments Access
# ============================================================
section "Appointments Access"

ADMIN_APPTS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/appointments?limit=1" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "Admin can access appointments" "$ADMIN_APPTS" "200"

STAFF_APPTS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/appointments?limit=1" -H "Authorization: Bearer $STAFF_TOKEN")
assert_eq "Staff can access appointments" "$STAFF_APPTS" "200"

LEAD_APPTS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/appointments?limit=1" -H "Authorization: Bearer $LEAD_TOKEN")
assert_eq "Lead User can access appointments" "$LEAD_APPTS" "200"

# ============================================================
# Users Management (Admin Only)
# ============================================================
section "Users Management (Admin Only)"

ADMIN_USERS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/users" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "Admin can access users" "$ADMIN_USERS" "200"

LEAD_USERS_RESP=$(curl -s "$API_URL/users" -H "Authorization: Bearer $LEAD_TOKEN")
LEAD_USERS_ERROR=$(json_field "$LEAD_USERS_RESP" "error")
if [ -n "$LEAD_USERS_ERROR" ]; then
  record_test "Lead User BLOCKED from users" "PASS"
else
  record_test "Lead User BLOCKED from users" "FAIL" "no error returned"
fi

STAFF_USERS_RESP=$(curl -s "$API_URL/users" -H "Authorization: Bearer $STAFF_TOKEN")
STAFF_USERS_ERROR=$(json_field "$STAFF_USERS_RESP" "error")
if [ -n "$STAFF_USERS_ERROR" ]; then
  record_test "Staff BLOCKED from users" "PASS"
else
  record_test "Staff BLOCKED from users" "FAIL" "no error returned"
fi

# ============================================================
# Staff-specific Endpoints
# ============================================================
section "Staff Endpoints"

STAFF_SUMMARY=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/appointments/staff-summary" -H "Authorization: Bearer $STAFF_TOKEN")
assert_eq "Staff can access staff-summary" "$STAFF_SUMMARY" "200"

STAFF_TODAY=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/appointments/today" -H "Authorization: Bearer $STAFF_TOKEN")
assert_eq "Staff can access today appointments" "$STAFF_TODAY" "200"

# ============================================================
# Auth/Me
# ============================================================
section "Auth/Me Endpoint"

assert_http_status "Unauthenticated /auth/me returns 401" "$API_URL/auth/me" "401"
assert_http_status "Admin /auth/me returns 200" "$API_URL/auth/me" "200" "$ADMIN_TOKEN"
assert_http_status "Lead /auth/me returns 200" "$API_URL/auth/me" "200" "$LEAD_TOKEN"
assert_http_status "Staff /auth/me returns 200" "$API_URL/auth/me" "200" "$STAFF_TOKEN"

print_summary "Role-Based Access"
