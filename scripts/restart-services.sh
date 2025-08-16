#!/usr/bin/env bash
set -euo pipefail

# Simple helper to restart the dockerhook and watcher systemd services
# Usage: ./restart-services.sh [PROJECT_DIR]
# If not run as root the script will re-run itself with sudo.

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Re-run with sudo if not root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This script requires root privileges to restart systemd services. Re-running with sudo..."
  exec sudo bash "$0" "$PROJECT_DIR"
fi

echo "Restarting services: dockerhook.service watcher.service"
systemctl restart dockerhook.service watcher.service

echo
systemctl status --no-pager dockerhook.service watcher.service || true

echo
echo "Done."
