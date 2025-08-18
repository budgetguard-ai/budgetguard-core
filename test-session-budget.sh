#!/bin/bash

# Test script for session budget enforcement (Option A)
# This tests that requests are blocked only AFTER accumulated costs exceed budget

set -e

BASE_URL="http://localhost:3000"
ADMIN_KEY="${ADMIN_API_KEY:-1234}"
BUDGET_USD="0.000001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

echo "🧪 Session Budget Enforcement Test (Option A)"
echo "============================================="

# Generate unique test identifiers
TENANT_NAME="session-budget-test-$(date +%s)"
SESSION_ID="budget-test-$(date +%s)"

print_step "1. Creating test tenant with very low session budget"
TENANT_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/tenant" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$TENANT_NAME\", \"defaultSessionBudgetUsd\": \"${BUDGET_USD}\"}" \
  -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $TENANT_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
TENANT_BODY=$(echo $TENANT_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $HTTP_STATUS -eq 200 ] || [ $HTTP_STATUS -eq 201 ]; then
    TENANT_ID=$(echo $TENANT_BODY | jq -r '.id')
    print_success "Tenant created: $TENANT_NAME (ID: $TENANT_ID) with \$$BUDGET_USD session budget"
else
    print_error "Failed to create tenant. Status: $HTTP_STATUS"
    echo "Response: $TENANT_BODY"
    exit 1
fi

print_step "2. Creating API key for tenant"
API_KEY_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/tenant/$TENANT_ID/apikeys" \
  -H "x-admin-key: $ADMIN_KEY" \
  -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $API_KEY_RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
API_KEY_BODY=$(echo $API_KEY_RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

if [ $HTTP_STATUS -eq 200 ] || [ $HTTP_STATUS -eq 201 ]; then
    API_KEY=$(echo $API_KEY_BODY | jq -r '.key')
    print_success "API key created: ${API_KEY:0:10}..."
else
    print_error "Failed to create API key. Status: $HTTP_STATUS"
    exit 1
fi

print_step "3. Testing Option A enforcement: First request should be ALLOWED"
print_info "Session starts with \$0 cost, which is < \$$BUDGET_USD budget"

FIRST_REQUEST=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "X-API-Key: $API_KEY" \
  -H "X-Session-Id: $SESSION_ID" \
  -H "X-Session-Name: Budget Test Session" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 10}' \
  -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $FIRST_REQUEST | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [ $HTTP_STATUS -eq 200 ]; then
    print_success "First request ALLOWED (expected) - session cost was \$0"
    echo "Response contains: $(echo $FIRST_REQUEST | sed -e 's/HTTPSTATUS:.*//g' | jq -r '.choices[0].message.content' 2>/dev/null | head -c 30)..."
else
    print_error "First request failed unexpectedly. Status: $HTTP_STATUS"
    echo "Response: $(echo $FIRST_REQUEST | sed -e 's/HTTPSTATUS:.*//g')"
fi

print_step "4. Making several more requests to exceed the \$$BUDGET_USD budget"
print_info "Each request will accumulate cost. Eventually current cost >= \$$BUDGET_USD"

BLOCKED=false
for i in {2..5}; do
    echo "Making request $i..."
    
    REQUEST=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
      -H "X-API-Key: $API_KEY" \
      -H "X-Session-Id: $SESSION_ID" \
      -H "Content-Type: application/json" \
      -d "{\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"Request number $i\"}], \"max_tokens\": 5}" \
      -w "HTTPSTATUS:%{http_code}")
    
    HTTP_STATUS=$(echo $REQUEST | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ $HTTP_STATUS -eq 402 ]; then
        print_success "Request $i BLOCKED by session budget (expected)"
        echo "Error message: $(echo $REQUEST | sed -e 's/HTTPSTATUS:.*//g' | jq -r '.error' 2>/dev/null)"
        BLOCKED=true
        break
    elif [ $HTTP_STATUS -eq 200 ]; then
        echo "Request $i allowed (cost still under budget)"
    else
        print_error "Request $i failed with unexpected status: $HTTP_STATUS"
        echo "Response: $(echo $REQUEST | sed -e 's/HTTPSTATUS:.*//g')"
        break
    fi
done

if [ "$BLOCKED" = true ]; then
    print_success "✅ Option A budget enforcement working correctly!"
    echo "   - First request allowed when session cost = \$0"
    echo "   - Subsequent request blocked when accumulated cost >= \$$BUDGET_USD"
else
    print_error "❌ Budget enforcement not working as expected"
    echo "   - All requests were allowed, none were blocked by session budget"
fi

print_step "5. Testing with new session (should be allowed again)"
NEW_SESSION_ID="budget-test-fresh-$(date +%s)"

FRESH_REQUEST=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "X-API-Key: $API_KEY" \
  -H "X-Session-Id: $NEW_SESSION_ID" \
  -H "X-Session-Name: Fresh Session Test" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Fresh session"}], "max_tokens": 5}' \
  -w "HTTPSTATUS:%{http_code}")

HTTP_STATUS=$(echo $FRESH_REQUEST | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

if [ $HTTP_STATUS -eq 200 ]; then
    print_success "Fresh session request ALLOWED (expected) - new session starts at \$0"
elif [ $HTTP_STATUS -eq 402 ]; then
    print_error "Fresh session unexpectedly blocked - should start with \$0 cost"
else
    print_error "Fresh session failed with unexpected status: $HTTP_STATUS"
fi

echo ""
print_info "Test Summary:"
echo "   - Session budget enforcement follows 'Option A' pattern"
echo "   - Requests allowed until accumulated cost >= budget limit"
echo "   - New sessions start fresh with \$0 accumulated cost"
echo "   - Budget limits are enforced at the session level"

echo ""
echo "🎯 Session Budget Test Complete!"