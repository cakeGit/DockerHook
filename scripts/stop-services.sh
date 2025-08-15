#!/usr/bin/env bash
set -euo pipefail

# Stop and disable the dockerhook and watcher services
# Usage: ./stop-services.sh [--remove-unit-files] [PROJECT_DIR]
# If PROJECT_DIR is omitted the script assumes the repo root is the parent of this script.

REMOVE_UNITS=0
ARG1=""
for arg in "$@"; do
  case "$arg" in
    --remove-unit-files) REMOVE_UNITS=1 ;;
    *) ARG1="$arg" ;;
  esac
done

PROJECT_DIR="${ARG1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Re-run with sudo if not root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This script requires root privileges to stop/disable systemd unit files. Re-running with sudo..."
  exec sudo bash "$0" "$@"
fi

echo "Stopping and disabling services"
systemctl disable --now dockerhook.service watcher.service || true
systemctl stop dockerhook.service watcher.service || true

if [ "$REMOVE_UNITS" -eq 1 ]; then
  echo "Removing unit files from /etc/systemd/system"
  rm -v /etc/systemd/system/dockerhook.service /etc/systemd/system/watcher.service || true
  systemctl daemon-reload || true
fi

echo "Done. Current status:"
systemctl status --no-pager dockerhook.service watcher.service || true
