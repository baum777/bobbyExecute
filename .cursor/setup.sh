#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_NODE_MAJOR="22"

read_node_major() {
  if ! command -v node >/dev/null 2>&1; then
    echo "0"
    return
  fi
  node -p "process.versions.node.split('.')[0]"
}

ensure_node_22() {
  local current_major
  current_major="$(read_node_major)"

  if [[ "${current_major}" == "${REQUIRED_NODE_MAJOR}" ]]; then
    return
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "${nvm_dir}/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "${nvm_dir}/nvm.sh"
    nvm install "${REQUIRED_NODE_MAJOR}" >/dev/null
    nvm use "${REQUIRED_NODE_MAJOR}" >/dev/null
    current_major="$(read_node_major)"
  fi

  if [[ "${current_major}" != "${REQUIRED_NODE_MAJOR}" ]]; then
    echo "ERROR: Node ${REQUIRED_NODE_MAJOR} wird benötigt, aktuell: $(node -v 2>/dev/null || echo 'nicht installiert')." >&2
    echo "Setze das Cloud-Agent-Base-Image auf Node ${REQUIRED_NODE_MAJOR}, falls nvm nicht verfügbar ist." >&2
    exit 1
  fi
}

ensure_node_22

cd "${ROOT_DIR}/bot"
npm install

# Verifikation: erforderliche Pakete müssen nach Install auflösbar sein.
npm ls snappyjs @types/snappyjs --depth=0 >/dev/null

echo "Cloud-Agent-Setup abgeschlossen (Node 22 + bot dependencies)."
