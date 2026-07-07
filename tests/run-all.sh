#!/usr/bin/env bash
# ShadowPaste V19 — Phase 11 War Test Runner
# Runs all 5 war tests sequentially and prints a final summary.
#
# Usage: bash tests/run-all.sh
#
# Note: integration tests (load-mcp-calls, attack-*) SKIP gracefully if the
# dev server is not running on http://localhost:3000. The unit test
# (load-secret-detector) always runs.

set -u  # fail on undefined vars
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
TESTS_DIR="$ROOT/tests"
RESULTS_DIR="$TESTS_DIR"

echo "============================================================"
echo " ShadowPaste V19 — Phase 11 War Test Suite"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo

declare -a TEST_NAMES=(
  "load-secret-detector"
  "load-mcp-calls"
  "attack-prompt-injection"
  "attack-tenant-isolation"
  "attack-stolen-token"
)

declare -A TEST_STATUS
declare -A TEST_DURATION

for name in "${TEST_NAMES[@]}"; do
  echo "============================================================"
  echo "▶ Running: $name"
  echo "============================================================"
  start=$(date +%s%N)
  if bun run "tests/${name}.ts"; then
    TEST_STATUS[$name]="PASS"
  else
    rc=$?
    TEST_STATUS[$name]="FAIL(rc=$rc)"
  fi
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  TEST_DURATION[$name]="${ms}ms"
  echo
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
for name in "${TEST_NAMES[@]}"; do
  printf "%-32s %-14s %s\n" "$name" "${TEST_STATUS[$name]}" "${TEST_DURATION[$name]}"
  if [[ "${TEST_STATUS[$name]}" != PASS* ]]; then
    # SKIP counts as a soft-pass for the suite (integration tests gracefully skip when server is down)
    if [[ "${TEST_STATUS[$name]}" != *"SKIP"* ]]; then
      overall=1
    fi
  fi
done
echo
if [ $overall -eq 0 ]; then
  echo "✅ War test suite PASSED (or skipped integration tests due to no server)"
else
  echo "❌ War test suite FAILED — see per-test output above"
fi

# ---- List result JSON files ----
echo
echo "Result JSON files:"
for name in secret mcp injection tenant token; do
  f="$RESULTS_DIR/results-${name}.json"
  if [ -f "$f" ]; then
    sz=$(wc -c < "$f" | tr -d ' ')
    echo "  $f ($sz bytes)"
  else
    echo "  $f  (missing — test may have been skipped or failed before writing)"
  fi
done

exit $overall
