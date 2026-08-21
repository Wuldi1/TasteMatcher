#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly FIXTURE_PATH="${REPOSITORY_ROOT}/scripts/ci/fixtures"
readonly LOGIN_SCRIPT="${REPOSITORY_ROOT}/scripts/azure/ensure-production-azure-login.sh"
readonly TEST_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/tastematcher-azure-login-test.XXXXXX")"

cleanup() {
  rm -rf "${TEST_DIRECTORY}"
}
trap cleanup EXIT

run_scenario() {
  local scenario="$1"
  local expected_result="$2"
  local scenario_directory="${TEST_DIRECTORY}/${scenario}"
  mkdir -p "${scenario_directory}"

  if PATH="${FIXTURE_PATH}:/usr/bin:/bin" \
    FAKE_AZ_SCENARIO="${scenario}" \
    FAKE_AZ_LOG="${scenario_directory}/calls.log" \
    FAKE_AZ_STATE="${scenario_directory}/state" \
    "${LOGIN_SCRIPT}" >"${scenario_directory}/stdout" 2>"${scenario_directory}/stderr"; then
    actual_result="success"
  else
    actual_result="failure"
  fi

  if [[ "${actual_result}" != "${expected_result}" ]]; then
    echo "Scenario '${scenario}' expected ${expected_result}, got ${actual_result}." >&2
    exit 1
  fi
}

run_scenario "existing_session" "success"
if grep -q '^login ' "${TEST_DIRECTORY}/existing_session/calls.log"; then
  echo "Existing Azure sessions must not trigger a new login." >&2
  exit 1
fi

run_scenario "login_required" "success"
grep -q '^login --tenant 043348b8-3c3a-488d-a337-62a7ce2e4ae8 --output none$' \
  "${TEST_DIRECTORY}/login_required/calls.log"

run_scenario "wrong_tenant" "failure"
grep -q 'unexpected tenant' "${TEST_DIRECTORY}/wrong_tenant/stderr"

run_scenario "selection_failure" "failure"
grep -q 'Unable to select the expected production subscription' \
  "${TEST_DIRECTORY}/selection_failure/stderr"

echo "Production Azure login tests passed."
