#!/bin/bash
# ============================================================
# Frontend Health Test
# Tests: HTML/JS/CSS loading, bundle integrity, SPA routing, TypeScript
# ============================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test-helpers.sh"

echo -e "${BOLD}Frontend Health Tests${NC}"
echo "Testing: HTML, JS, CSS, SPA routing, TypeScript"
echo "Target: $BASE_URL"
echo ""

# ============================================================
# Asset Loading
# ============================================================
section "Asset Loading"

assert_http_status "Homepage returns 200" "$BASE_URL/" "200"

# Get JS bundle path
BUNDLE_PATH=$(curl -s "$BASE_URL/" | grep -o '/assets/index-[^"]*\.js')
if [ -n "$BUNDLE_PATH" ]; then
  record_test "JS bundle path found: $BUNDLE_PATH" "PASS"
  assert_http_status "JS bundle loads" "$BASE_URL$BUNDLE_PATH" "200"

  JS_SIZE=$(curl -s "$BASE_URL$BUNDLE_PATH" | wc -c | tr -d ' ')
  if [ "$JS_SIZE" -gt 100000 ]; then
    record_test "JS bundle size reasonable (${JS_SIZE} bytes)" "PASS"
  else
    record_test "JS bundle size reasonable" "FAIL" "only ${JS_SIZE} bytes (too small)"
  fi
else
  record_test "JS bundle path found" "FAIL" "no bundle in HTML"
fi

# Get CSS bundle path
CSS_PATH=$(curl -s "$BASE_URL/" | grep -o '/assets/index-[^"]*\.css')
if [ -n "$CSS_PATH" ]; then
  record_test "CSS bundle path found: $CSS_PATH" "PASS"
  assert_http_status "CSS bundle loads" "$BASE_URL$CSS_PATH" "200"
else
  record_test "CSS bundle path found" "FAIL" "no CSS in HTML"
fi

# Check favicon
assert_http_status "Tooth favicon loads" "$BASE_URL/tooth.svg" "200"

# ============================================================
# SPA Routing
# ============================================================
section "SPA Routing (all paths return index.html)"

SPA_ROUTES=("/" "/login" "/leads" "/appointments" "/visited" "/treatment" "/treatment-denied" "/follow-ups" "/dnr-dnc" "/lost" "/reports" "/analytics" "/users" "/settings" "/leads/some-id" "/nonexistent-route")

for route in "${SPA_ROUTES[@]}"; do
  assert_http_status "SPA: $route → 200" "$BASE_URL$route" "200"
done

# ============================================================
# API Proxy
# ============================================================
section "API Proxy"

assert_http_status "API proxy works (401 for unauthenticated)" "$BASE_URL/api/v1/auth/me" "401"

# ============================================================
# Bundle Content Integrity
# ============================================================
section "Bundle Content Integrity"

BUNDLE=$(get_bundle_content)

# Core app components — use string literals that survive minification
assert_bundle_contains "DentraCRM branding" "$BUNDLE" "DentraCRM"
assert_bundle_contains "Login page text" "$BUNDLE" "Sign in"
assert_bundle_contains "Leads text" "$BUNDLE" "Leads"
assert_bundle_contains "Appointments text" "$BUNDLE" "Appointments"
assert_bundle_contains "Settings text" "$BUNDLE" "Settings"
assert_bundle_contains "Patient Journey section" "$BUNDLE" "Patient Journey"
assert_bundle_contains "API base path" "$BUNDLE" "/api/v1"

# ============================================================
# TypeScript Check (source code)
# ============================================================
section "TypeScript Compilation"

FRONTEND_DIR="$SCRIPT_DIR/../../frontend"
BACKEND_DIR="$SCRIPT_DIR/../../backend"

if [ -d "$FRONTEND_DIR" ]; then
  echo "  Checking frontend..."
  if cd "$FRONTEND_DIR" && npx tsc --noEmit 2>&1; then
    record_test "Frontend TypeScript check" "PASS"
  else
    record_test "Frontend TypeScript check" "FAIL" "compilation errors"
  fi
else
  record_test "Frontend TypeScript check" "SKIP" "directory not found"
fi

if [ -d "$BACKEND_DIR" ]; then
  echo "  Checking backend..."
  if cd "$BACKEND_DIR" && npx tsc --noEmit 2>&1; then
    record_test "Backend TypeScript check" "PASS"
  else
    record_test "Backend TypeScript check" "FAIL" "compilation errors"
  fi
else
  record_test "Backend TypeScript check" "SKIP" "directory not found"
fi

print_summary "Frontend Health"
