#!/usr/bin/env bash

set -euo pipefail

readonly EXPECTED_SUBSCRIPTION_ID="e105e38a-7820-4c7e-b1da-de05227d6355"
readonly EXPECTED_TENANT_ID="043348b8-3c3a-488d-a337-62a7ce2e4ae8"

if ! command -v az >/dev/null 2>&1; then
  echo "Required command 'az' is not installed." >&2
  exit 1
fi

login_to_expected_tenant() {
  echo "Azure CLI authentication is required. Opening the Microsoft sign-in flow..."
  az login --tenant "${EXPECTED_TENANT_ID}" --output none
}

if ! az account show --query id --output tsv >/dev/null 2>&1; then
  login_to_expected_tenant
fi

if ! az account set --subscription "${EXPECTED_SUBSCRIPTION_ID}" >/dev/null 2>&1; then
  echo "The current Azure session cannot select the production subscription. Reauthenticating..."
  login_to_expected_tenant
  if ! az account set --subscription "${EXPECTED_SUBSCRIPTION_ID}" >/dev/null 2>&1; then
    echo "Unable to select the expected production subscription ${EXPECTED_SUBSCRIPTION_ID}." >&2
    exit 1
  fi
fi

active_subscription_id="$(az account show --query id --output tsv)"
active_tenant_id="$(az account show --query tenantId --output tsv)"

if [[ "${active_subscription_id}" != "${EXPECTED_SUBSCRIPTION_ID}" ]]; then
  echo "Azure CLI selected an unexpected subscription after authentication." >&2
  exit 1
fi

if [[ "${active_tenant_id}" != "${EXPECTED_TENANT_ID}" ]]; then
  echo "Azure CLI selected an unexpected tenant after authentication." >&2
  exit 1
fi

echo "Azure CLI is authenticated to the approved production subscription."
