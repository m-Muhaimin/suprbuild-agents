#!/bin/bash
# Deploy script - run locally to push code to Hostinger VPS
# Usage: ./deploy/deploy.sh user@your-server-ip

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 user@server-ip"
  echo "Example: $0 root@123.45.67.89"
  exit 1
fi

REMOTE="$1"
APP_DIR="/var/www/suprbuild-agent"

echo "=== Deploying SuprBuild Agent to $REMOTE ==="

# Build file list (exclude node_modules, .env, data)
FILES=$(git ls-files --others --cached --exclude-standard | grep -v 'node_modules/' | grep -v '\.env$' | grep -v 'src/data/')

echo "[1/3] Uploading files..."
rsync -avz --exclude 'node_modules' --exclude '.env' --exclude 'src/data/*.db*' --exclude 'nul' \
  --delete ./ "$REMOTE:$APP_DIR/"

echo "[2/3] Installing dependencies on server..."
ssh "$REMOTE" "cd $APP_DIR && npm install --production && mkdir -p src/data"

echo "[3/3] Restarting service..."
ssh "$REMOTE" "sudo systemctl restart suprbuild-agent"

echo ""
echo "=== Deploy Complete ==="
echo "Check status: ssh $REMOTE 'sudo systemctl status suprbuild-agent'"
echo "View logs:    ssh $REMOTE 'sudo journalctl -u suprbuild-agent -f --no-pager'"
