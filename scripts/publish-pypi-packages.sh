#!/usr/bin/env bash
# Build and upload all eep-* Python packages to PyPI (local maintainer flow).
#
# Prerequisites:
#   - PyPI account with upload rights for: eep-signer, eep-validator, eep-gates,
#     eep-discovery, eep-compliance-cli, eep-mcp-bridge, eep-middleware
#   - API token: export TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-...
#     (or configure ~/.pypirc)
#   - pip install build twine
#
# Usage:
#   ./scripts/publish-pypi-packages.sh [version] [--from PACKAGE_DIR] [--skip-existing]
#
# Examples:
#   ./scripts/publish-pypi-packages.sh 0.1.0
#   ./scripts/publish-pypi-packages.sh 0.1.0 --from eep-compliance-cli-python
#   PYPI_PAUSE_SEC=90 ./scripts/publish-pypi-packages.sh 0.1.0 --skip-existing
#
# PyPI rate-limits upload POSTs (HTTP 429), especially wheel+sdist back-to-back and
# repeated failed runs. Default: 120s between packages, one file per twine call.
# Set PYPI_WHEEL_ONLY=1 to skip sdist (valid on PyPI; halves upload requests).
# On 429: stop retrying for hours — see RELEASING.md "PyPI upload troubleshooting".

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="0.1.0"
START_FROM=""
SKIP_EXISTING=0

while [ $# -gt 0 ]; do
  case "$1" in
    --from)
      START_FROM="${2:?--from requires a package directory name, e.g. eep-compliance-cli-python}"
      shift 2
      ;;
    --skip-existing)
      SKIP_EXISTING=1
      shift
      ;;
    -h|--help)
      sed -n '1,22p' "$0"
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        VERSION="$1"
      else
        echo "error: unknown argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Seconds to wait between packages and between wheel vs sdist for the same package.
PYPI_PAUSE_SEC="${PYPI_PAUSE_SEC:-120}"
PYPI_FILE_PAUSE_SEC="${PYPI_FILE_PAUSE_SEC:-30}"
# On 429 only: wait before retry (do not hammer PyPI — makes limits last longer).
PYPI_UPLOAD_RETRY_SEC="${PYPI_UPLOAD_RETRY_SEC:-600}"
PYPI_UPLOAD_MAX_RETRIES="${PYPI_UPLOAD_MAX_RETRIES:-2}"
# Set to 1 to upload only *.whl (recommended when recovering from 429).
PYPI_WHEEL_ONLY="${PYPI_WHEEL_ONLY:-0}"

PACKAGES=(
  eep-signer-python
  eep-validator-python
  eep-gates-python
  eep-discovery-python
  eep-compliance-cli-python
  eep-mcp-bridge-python
  eep-middleware-python
)

python3 -m pip install -q --upgrade pip build twine

if [ -z "${TWINE_PASSWORD:-}" ] && [ ! -f "${HOME}/.pypirc" ]; then
  echo "error: set TWINE_USERNAME=__token__ and TWINE_PASSWORD=<pypi-api-token>" >&2
  echo "       or configure ~/.pypirc before uploading." >&2
  exit 1
fi

set_version() {
  python3 - <<'PY' "$1" "$2"
import pathlib, re, sys
path = pathlib.Path(sys.argv[1]) / "pyproject.toml"
version = sys.argv[2]
text = path.read_text()
new = re.sub(r'^version\s*=\s*".*?"', f'version = "{version}"', text, count=1, flags=re.M)
path.write_text(new)
PY
}

restore_version() {
  git -C "${ROOT}" checkout -- "packages/${1}/pyproject.toml" 2>/dev/null || true
}

pypi_has_version() {
  local project="$1"
  local ver="$2"
  curl -fsS "https://pypi.org/pypi/${project}/json" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if '${ver}' in d.get('releases',{}) else 1)" 2>/dev/null
}

twine_upload_with_retry() {
  local file="$1"
  local attempt=1
  local max="${PYPI_UPLOAD_MAX_RETRIES}"
  local wait="${PYPI_UPLOAD_RETRY_SEC}"
  local log
  log="$(mktemp)"
  while [ "${attempt}" -le "${max}" ]; do
    if twine upload --verbose "${file}" 2>&1 | tee "${log}"; then
      rm -f "${log}"
      return 0
    fi
    local code=$?
    if ! grep -qE '429|Too Many Requests' "${log}"; then
      echo "error: twine upload failed (not a 429 — fix the error above before retrying)" >&2
      rm -f "${log}"
      return "${code}"
    fi
    rm -f "${log}"
    if [ "${attempt}" -eq "${max}" ]; then
      echo "error: PyPI returned 429 for ${file} after ${max} attempts." >&2
      echo "       Stop uploading for several hours. See RELEASING.md PyPI upload troubleshooting." >&2
      return "${code}"
    fi
    echo "PyPI 429 on ${file}; waiting ${wait}s before retry ${attempt}/${max}..." >&2
    sleep "${wait}"
    wait=$((wait * 2))
    attempt=$((attempt + 1))
  done
}

upload_dist_artifacts() {
  local wheel sdist
  wheel="$(find dist -maxdepth 1 -name '*.whl' -print -quit 2>/dev/null || true)"
  sdist="$(find dist -maxdepth 1 -name '*.tar.gz' -print -quit 2>/dev/null || true)"
  if [ -z "${wheel}" ] && [ -z "${sdist}" ]; then
    echo "error: no artifacts in dist/" >&2
    return 1
  fi
  if [ -n "${wheel}" ]; then
    twine_upload_with_retry "${wheel}"
  fi
  if [ "${PYPI_WHEEL_ONLY}" = "1" ]; then
    echo "note: PYPI_WHEEL_ONLY=1 — skipped sdist"
    return 0
  fi
  if [ -n "${sdist}" ]; then
    echo "Pausing ${PYPI_FILE_PAUSE_SEC}s before sdist upload..."
    sleep "${PYPI_FILE_PAUSE_SEC}"
    twine_upload_with_retry "${sdist}"
  fi
}

resume_skip=0
if [ -n "${START_FROM}" ]; then
  resume_skip=1
fi

for pkg in "${PACKAGES[@]}"; do
  if [ "${resume_skip}" -eq 1 ]; then
    if [ "${pkg}" = "${START_FROM}" ]; then
      resume_skip=0
    else
      echo "skip (resume): ${pkg}"
      continue
    fi
  fi

  dir="${ROOT}/packages/${pkg}"
  name="$(python3 -c "import tomllib; print(tomllib.load(open('${dir}/pyproject.toml','rb'))['project']['name'])")"

  if [ "${SKIP_EXISTING}" -eq 1 ] && pypi_has_version "${name}" "${VERSION}"; then
    echo "skip (already on PyPI): ${name}@${VERSION}"
    continue
  fi

  echo ""
  echo "════════════════════════════════════════"
  echo "Publishing ${name}@${VERSION} (${pkg})"
  echo "════════════════════════════════════════"
  (
    cd "${dir}"
    set_version "${dir}" "${VERSION}"
    rm -rf dist build .pytest_cache
    find . -maxdepth 1 -name '*.egg-info' -exec rm -rf {} + 2>/dev/null || true
    python3 -m build
    twine check dist/*
    upload_dist_artifacts
    restore_version "${pkg}"
  )
  echo "✓ ${name}@${VERSION} uploaded"

  if [ "${pkg}" != "eep-middleware-python" ]; then
    echo "Pausing ${PYPI_PAUSE_SEC}s before next package (PyPI rate limit)..."
    sleep "${PYPI_PAUSE_SEC}"
  fi
done

echo ""
echo "All Python packages uploaded at ${VERSION}."
echo "Verify: https://pypi.org/search/?q=eep"
