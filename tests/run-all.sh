#!/usr/bin/env bash
# ShadowPaste — War Test Runner
# Starts the dev server, runs all tests, prints summary.
# Unit tests always run. Integration tests require the server (started automatically).

set -u
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
TESTS_DIR="$ROOT/tests"

echo "============================================================"
echo " ShadowPaste — War Test Suite"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo

# Start dev server if not running
SERVER_STARTED=0
if ! curl -s --max-time 2 http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "▶ Starting dev server..."
  nohup setsid bun run dev > /dev/null 2>&1 &
  disown
  SERVER_STARTED=1
  # Wait for server
  for i in $(seq 1 30); do
    if curl -s --max-time 2 http://localhost:3000/api/health > /dev/null 2>&1; then
      echo "  ✓ Server ready"
      break
    fi
    sleep 2
  done
fi

# Seed database
curl -s -X POST http://localhost:3000/api/seed > /dev/null 2>&1

declare -a TEST_NAMES=(
  "load-secret-detector"
  "attack-prompt-injection"
  "attack-tenant-isolation"
  "attack-stolen-token"
  "attack-rate-limit"
  "attack-billing-bypass"
  "test-real-scanner"
  "test-health-metrics"
  # Note: load-mcp-calls is a long load test (28s) that can destabilize the dev server.
  # Run it separately with: bun run tests/load-mcp-calls.ts
)

declare -A TEST_STATUS
declare -A TEST_DURATION

for name in "${TEST_NAMES[@]}"; do
  echo "============================================================"
  echo "▶ Running: $name"
  echo "============================================================"
  
  # Check server health before each integration test, restart if needed
  if [ "$name" != "load-secret-detector" ]; then
    if ! curl -s --max-time 2 http://localhost:3000/api/health > /dev/null 2>&1; then
      echo "  ℹ️  Server down, restarting..."
      nohup setsid bun run dev > /dev/null 2>&1 &
      disown
      for i in $(seq 1 20); do
        if curl -s --max-time 2 http://localhost:3000/api/health > /dev/null 2>&1; then break; fi
        sleep 2
      done
      curl -s -X POST http://localhost:3000/api/seed > /dev/null 2>&1
    fi
  fi
  
  start=$(date +%s%N)
  output=$(bun run "tests/${name}.ts" 2>&1)
  rc=$?
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  TEST_DURATION[$name]="${ms}ms"
  
  if [ $rc -eq 0 ]; then
    if echo "$output" | grep -q "SKIP"; then
      TEST_STATUS[$name]="SKIP"
    else
      TEST_STATUS[$name]="PASS"
    fi
  else
    TEST_STATUS[$name]="FAIL(rc=$rc)"
  fi
  
  echo "$output" | tail -3
  echo "  → ${name}: ${TEST_STATUS[$name]} (${TEST_DURATION[$name]})"
  echo
done

# ---- Final summary ----
echo "============================================================"
echo " WAR TEST SUITE SUMMARY"
echo "============================================================"
printf "%-32s %-14s %s\n" "Test" "Status" "Duration"
printf "%-32s %-14s %s\n" "----" "------" "-------"
overall=0
PASS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0
for name in "${TEST_NAMES[@]}"; do
  printf "%-32s %-14s %s\n" "$name" "${TEST_STATUS[$name]}" "${TEST_DURATION[$name]}"
  case "${TEST_STATUS[$name]}" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    SKIP) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
    *)    FAIL_COUNT=$((FAIL_COUNT + 1)); overall=1 ;;
  esac
done
echo
echo "  PASS: $PASS_COUNT | SKIP: $SKIP_COUNT | FAIL: $FAIL_COUNT"
echo
if [ $overall -eq 0 ]; then
  echo "✅ War test suite PASSED"
else
  echo "❌ War test suite FAILED"
fi

exit $overall
