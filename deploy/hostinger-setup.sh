#!/bin/bash
# Hostinger VPS Setup Script for SuprBuild Agent
# Run as root: bash deploy/hostinger-setup.sh

set -e

APP_DIR="/var/www/suprbuild-agent"
APP_USER="suprbuild"
NODE_VERSION="20"

echo "=== SuprBuild Agent VPS Setup ==="

# 1. Install system dependencies
echo "[1/7] Installing system dependencies..."
apt update && apt install -y nginx certbot python3-certbot-nginx curl git build-essential

# 2. Install Node.js
echo "[2/7] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
  apt install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# 3. Create app user
echo "[3/7] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
fi

# 4. Setup app directory
echo "[4/7] Setting up app directory..."
mkdir -p "$APP_DIR/src/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 5. Setup app (run from app directory after uploading code)
echo "[5/7] Installing dependencies..."
cd "$APP_DIR"
npm install --production
mkdir -p src/data

# 6. Create .env
echo "[6/7] Creating .env file..."
cat > "$APP_DIR/.env" << 'EOF'
PORT=3001
NODE_ENV=production
EOF

# 7. Install systemd service
echo "[7/7] Installing systemd service..."
cp deploy/suprbuild-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable suprbuild-agent
systemctl start suprbuild-agent

echo ""
echo "=== Setup Complete ==="
echo "App running at: http://localhost:3001"
echo "Next steps:"
echo "  1. Configure your domain DNS to point to this VPS"
echo "  2. Update deploy/nginx.conf with your domain"
echo "  3. Run: cp deploy/nginx.conf /etc/nginx/sites-available/suprbuild-agent"
echo "  4. Run: ln -s /etc/nginx/sites-available/suprbuild-agent /etc/nginx/sites-enabled/"
echo "  5. Run: certbot --nginx -d yourdomain.com"
echo "  6. Run: systemctl restart nginx"
echo ""
echo "Service commands:"
echo "  systemctl status suprbuild-agent"
echo "  journalctl -u suprbuild-agent -f"
echo "  systemctl restart suprbuild-agent"
