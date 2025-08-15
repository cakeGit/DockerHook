#!/usr/bin/env bash
set -euo pipefail

# Install and start the dockerhook and watcher systemd services
# Usage: ./start-services.sh [PROJECT_DIR]
# If PROJECT_DIR is omitted the script assumes the repo root is the parent of this script.

PROJECT_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_DIR="/etc/systemd/system"

echo "Project dir: $PROJECT_DIR"

# Re-run with sudo if not root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This script requires root privileges to install systemd unit files. Re-running with sudo..."
  exec sudo bash "$0" "$PROJECT_DIR"
fi

if [ ! -d "$PROJECT_DIR/systemd" ]; then
  echo "ERROR: $PROJECT_DIR/systemd does not exist. Run this from the cloned repo or pass the repo path as the first argument."
  exit 2
fi

echo "Copying unit files to $SERVICE_DIR"
cp -v "$PROJECT_DIR/systemd/"*.service "$SERVICE_DIR/"

echo "Reloading systemd daemon"
systemctl daemon-reload

echo "Enabling and starting services"
systemctl enable --now dockerhook.service watcher.service

echo
systemctl status --no-pager dockerhook.service watcher.service || true

echo
echo "To follow logs run: sudo journalctl -u dockerhook.service -f"
