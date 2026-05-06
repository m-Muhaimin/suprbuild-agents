# SuprBuild Agent - Hostinger VPS Deployment

## Prerequisites
- Hostinger VPS (Ubuntu 22.04+)
- Domain pointed to your VPS IP
- SSH access to your server

## Step 1: Upload Code

### Option A: Git Clone (Recommended)
```bash
ssh root@YOUR_SERVER_IP
cd /var/www
git clone YOUR_REPO_URL suprbuild-agent
cd suprbuild-agent
```

### Option B: SCP Upload
```bash
scp -r ./* root@YOUR_SERVER_IP:/var/www/suprbuild-agent/
```

## Step 2: Run Setup Script
```bash
ssh root@YOUR_SERVER_IP
cd /var/www/suprbuild-agent
chmod +x deploy/hostinger-setup.sh
bash deploy/hostinger-setup.sh
```

This installs Node.js, nginx, dependencies, creates a service user, and starts the app.

## Step 3: Configure Nginx
```bash
# Edit the nginx config with your domain
sed -i 's/YOUR_DOMAIN.COM/yourdomain.com/g' deploy/nginx.conf

# Install nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/suprbuild-agent
sudo ln -sf /etc/nginx/sites-available/suprbuild-agent /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Step 4: SSL Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Step 5: Verify
```bash
curl https://yourdomain.com/health
curl https://yourdomain.com/llms.txt
```

## Deploy Updates
```bash
# Option A: Use deploy script
chmod +x deploy/deploy.sh
./deploy/deploy.sh root@YOUR_SERVER_IP

# Option B: Manual
ssh root@YOUR_SERVER_IP
cd /var/www/suprbuild-agent
git pull
npm install --production
sudo systemctl restart suprbuild-agent
```

## Service Management
```bash
sudo systemctl status suprbuild-agent    # Check status
sudo systemctl restart suprbuild-agent   # Restart
sudo systemctl stop suprbuild-agent      # Stop
sudo journalctl -u suprbuild-agent -f    # Live logs
```

## Database Backup
```bash
# Backup
cp /var/www/suprbuild-agent/src/data/suprbuild.db /var/www/suprbuild-agent/src/data/suprbuild.db.bak

# Download to local
scp root@YOUR_SERVER_IP:/var/www/suprbuild-agent/src/data/suprbuild.db ./backup/
```

## Environment Variables
Edit `/var/www/suprbuild-agent/.env`:
```
PORT=3001
NODE_ENV=production
```

## Firewall (UFW)
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Troubleshooting

### App won't start
```bash
sudo journalctl -u suprbuild-agent -n 50 --no-pager
```

### Port already in use
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
```

### Permission denied on database
```bash
sudo chown -R suprbuild:suprbuild /var/www/suprbuild-agent/src/data
```

### Nginx 502 Bad Gateway
```bash
sudo systemctl status suprbuild-agent  # Make sure app is running
sudo nginx -t                          # Check nginx config
```
