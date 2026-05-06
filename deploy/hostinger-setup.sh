#!/bin/bash
# Hostinger VPS Setup Script for SuprBuild Agent (PostgreSQL)
# Run as root: bash deploy/hostinger-setup.sh

set -e

APP_DIR="/var/www/suprbuild-agent"
APP_USER="suprbuild"
DB_NAME="suprbuild"
DB_USER="suprbuild"
DB_PASS=$(openssl rand -base64 32)
NODE_VERSION="20"

echo "=== SuprBuild Agent VPS Setup (PostgreSQL) ==="

# 1. Install system dependencies
echo "[1/8] Installing system dependencies..."
apt update && apt install -y nginx certbot python3-certbot-nginx curl git build-essential postgresql postgresql-contrib

# 2. Install Node.js
echo "[2/8] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
  apt install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# 3. Setup PostgreSQL
echo "[3/8] Configuring PostgreSQL..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null || true
echo "Database: $DB_NAME | User: $DB_USER | Password: $DB_PASS"

# 4. Create app user
echo "[4/8] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
fi

# 5. Setup app directory
echo "[5/8] Setting up app directory..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 6. Install dependencies
echo "[6/8] Installing dependencies..."
cd "$APP_DIR"
npm install --production

# 7. Create .env
echo "[7/8] Creating .env file..."
cat > "$APP_DIR/.env" << EOF
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
BASE_URL=https://YOUR_DOMAIN.COM
CORS_ORIGIN=*
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# 8. Install systemd service
echo "[8/8] Installing systemd service..."
cp deploy/suprbuild-agent.service /etc/systemd/system/
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/suprbuild-agent.service
systemctl daemon-reload
systemctl enable suprbuild-agent
systemctl start suprbuild-agent

echo ""
echo "=== Setup Complete ==="
echo "App:    http://localhost:3001"
echo "DB:     postgresql://$DB_USER:****@localhost:5432/$DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Configure DNS to point to this VPS"
echo "  2. Update deploy/nginx.conf with your domain"
echo "  3. Run: cp deploy/nginx.conf /etc/nginx/sites-available/suprbuild-agent"
echo "  4. Run: ln -s /etc/nginx/sites-available/suprbuild-agent /etc/nginx/sites-enabled/"
echo "  5. Run: certbot --nginx -d yourdomain.com"
echo "  6. Run: systemctl restart nginx"
echo ""
echo "Service commands:"
echo "  systemctl status suprbuild-agent"
echo "  journalctl -u suprbuild-agent -f"
echo ""
echo "⚠️  Save your DB password: $DB_PASS"
