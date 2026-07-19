#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/dss-broker"
OUTPUT_DIR="${PROJECT_DIR}/out"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

repository_name() {
  local remote_url repo_name
  remote_url="$(git -C "${SCRIPT_DIR}" config --get remote.origin.url 2>/dev/null || true)"
  if [[ -n "${remote_url}" ]]; then
    remote_url="${remote_url%/}"
    repo_name="${remote_url##*/}"
    printf '%s\n' "${repo_name%.git}"
  else
    basename "${SCRIPT_DIR}"
  fi
}

normalize_base_path() {
  local requested_path="$1"
  if [[ -z "${requested_path}" ]]; then
    local repo_name
    repo_name="$(repository_name)"
    if [[ "${repo_name}" == *.github.io ]]; then
      printf '\n'
    else
      printf '/%s\n' "${repo_name}"
    fi
    return
  fi

  if [[ "${requested_path}" == "/" ]]; then
    printf '\n'
    return
  fi

  requested_path="${requested_path#/}"
  requested_path="${requested_path%/}"
  [[ -n "${requested_path}" ]] || fail "The GitHub Pages base path is invalid."
  [[ "${requested_path}" != *[[:space:]]* ]] || fail "The GitHub Pages base path cannot contain spaces."
  printf '/%s\n' "${requested_path}"
}

[[ -f "${PROJECT_DIR}/package.json" ]] || fail "Could not find ${PROJECT_DIR}/package.json."
[[ -f "${PROJECT_DIR}/package-lock.json" ]] || fail "Could not find ${PROJECT_DIR}/package-lock.json."
command -v node >/dev/null 2>&1 || fail "Node.js is required but was not found."
command -v npm >/dev/null 2>&1 || fail "npm is required but was not found."

NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_REMAINDER="${NODE_VERSION#*.}"
NODE_MINOR="${NODE_REMAINDER%%.*}"
if (( NODE_MAJOR < 20 || (NODE_MAJOR == 20 && NODE_MINOR < 9) )); then
  fail "Node.js 20.9.0 or newer is required; found ${NODE_VERSION}."
fi

REQUESTED_BASE_PATH="${1:-${GITHUB_PAGES_BASE_PATH:-}}"
PAGES_BASE_PATH="$(normalize_base_path "${REQUESTED_BASE_PATH}")"

printf 'Preparing DSS-Broker for GitHub Pages\n'
printf 'Project:   %s\n' "${PROJECT_DIR}"
printf 'Base path: %s\n' "${PAGES_BASE_PATH:-/}"

cd "${PROJECT_DIR}"

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  printf '\nInstalling locked dependencies...\n'
  npm ci --no-audit --no-fund
else
  printf '\nSkipping dependency installation (SKIP_INSTALL=1).\n'
fi

printf '\nBuilding static GitHub Pages export...\n'
export GITHUB_PAGES_BUILD=1
export NEXT_PUBLIC_BASE_PATH="${PAGES_BASE_PATH}"
npm run build

[[ -f "${OUTPUT_DIR}/index.html" ]] || fail "The build completed without creating ${OUTPUT_DIR}/index.html."
touch "${OUTPUT_DIR}/.nojekyll"

if [[ -n "${GITHUB_PAGES_CNAME:-}" ]]; then
  printf '%s\n' "${GITHUB_PAGES_CNAME}" > "${OUTPUT_DIR}/CNAME"
  printf 'Custom domain: %s\n' "${GITHUB_PAGES_CNAME}"
fi

printf '\nGitHub Pages build completed successfully.\n'
printf 'Deploy the contents of: %s\n' "${OUTPUT_DIR}"
