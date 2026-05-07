# SuprBuild Agent Platform - Deployment Guide

## Production Deployment Options

### Option 1: Docker (Recommended)

#### Prerequisites
- Docker & Docker Compose installed
- Domain name with DNS configured
- SSL certificate (Let's Encrypt)

#### Steps

1. **Prepare server**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker $USER
```

2. **Clone and configure**
```bash
git clone https://github.com/m-Muhaimin/suprbuild-agents.git
cd suprbuild-agents
cp .env.example .env
# Edit .env with production values
nano .env
```

3. **Set production environment**
```bash
# In .env
NODE_ENV=production
JWT_SECRET=<generate-with-openssl-rand-hex-32>
CORS_ORIGIN=https://your-domain.com
```

4. **Start services**
```bash
docker-compose -f docker-compose.yml up -d
docker-compose logs -f suprbuild-api
```

5. **Set up reverse proxy (Nginx)**
```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/suprbuild-agents
sudo ln -s /etc/nginx/sites-available/suprbuild-agents /etc/nginx/sites-enabled/

# Update server name
sudo sed -i 's/api.suprbuild.dev/your-domain.com/g' /etc/nginx/sites-available/suprbuild-agents

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

6. **Install SSL certificate**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
# Update nginx.conf paths
```

---

### Option 2: PM2 (Node Process Manager)

#### Prerequisites
- Node.js 16+, npm 8+
- Ubuntu/Debian server
- Nginx reverse proxy
- PM2 installed globally

#### Steps

1. **Install PM2 globally**
```bash
sudo npm install -g pm2
```

2. **Clone and setup**
```bash
git clone https://github.com/m-Muhaimin/suprbuild-agents.git
cd suprbuild-agents
npm ci --only=production
cp .env.example .env
nano .env  # Set production values
```

3. **Start with PM2**
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

4. **Setup Nginx**
```bash
sudo cp nginx.conf /etc/nginx/sites-available/suprbuild-agents
sudo ln -s /etc/nginx/sites-available/suprbuild-agents /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

5. **Monitor**
```bash
pm2 monit
pm2 logs suprbuild-api
pm2 status
```

---

### Option 3: Kubernetes (Enterprise)

#### Prerequisites
- Kubernetes cluster (EKS, GKE, or self-hosted)
- kubectl configured
- Helm (optional)

#### Steps

1. **Create namespace**
```bash
kubectl create namespace suprbuild
```

2. **Create ConfigMap and Secret**
```bash
kubectl create configmap suprbuild-config \
  -n suprbuild \
  --from-env-file=.env.production

kubectl create secret generic suprbuild-secrets \
  -n suprbuild \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32)
```

3. **Deploy**
```bash
kubectl apply -f k8s/deployment.yaml -n suprbuild
kubectl apply -f k8s/service.yaml -n suprbuild
kubectl apply -f k8s/ingress.yaml -n suprbuild
```

4. **Verify**
```bash
kubectl get pods -n suprbuild
kubectl logs deployment/suprbuild-api -n suprbuild
```

---

## Database Setup

### Backup Strategy
```bash
# Automated daily backup
0 2 * * * /usr/local/bin/backup-suprbuild.sh

# Create backup script
cat > /usr/local/bin/backup-suprbuild.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/suprbuild"
DATE=$(date +%Y%m%d_%H%M%S)
sqlite3 /app/data/suprbuild.db ".backup '/backups/suprbuild/db_$DATE.db'"
# Keep last 30 days
find $BACKUP_DIR -mtime +30 -delete
EOF

chmod +x /usr/local/bin/backup-suprbuild.sh
```

### Database Maintenance
```bash
# Run periodically
sqlite3 /app/data/suprbuild.db "VACUUM;"
sqlite3 /app/data/suprbuild.db "ANALYZE;"
sqlite3 /app/data/suprbuild.db "PRAGMA optimize;"
```

---

## SSL/TLS Setup

### Let's Encrypt with Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
sudo certbot renew --dry-run  # Test renewal
sudo systemctl enable certbot.timer
```

### Self-signed (Development only)
```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -out cert.pem -keyout key.pem -days 365
```

---

## Monitoring & Logging

### Application Logs
```bash
# Docker
docker-compose logs -f suprbuild-api

# PM2
pm2 logs suprbuild-api
pm2 monit

# Direct
tail -f /var/log/nginx/suprbuild-access.log
```

### Health Check
```bash
curl -s http://localhost:3001/health | jq
```

### Metrics (Optional - Prometheus)
```bash
# Add metrics endpoint
npm install prom-client

# Expose on :9090
curl http://localhost:9090/metrics
```

---

## Scaling Considerations

### Horizontal Scaling
- Load balance across multiple instances
- Use Nginx upstream for Docker containers
- Use PM2 cluster mode for Node.js

### Vertical Scaling
- Increase `max_memory_restart` in PM2
- Optimize database indexes
- Cache frequently accessed data

### Database Optimization
```sql
-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM agents WHERE status = 'active';

-- Add indexes for slow queries
CREATE INDEX idx_agents_status_reputation 
ON agents(status, reputation_score DESC);
```

---

## Security Hardening

### 1. Firewall
```bash
sudo ufw enable
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
```

### 2. Environment Secrets
```bash
# Use strong JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Store in secure location
sudo chmod 600 .env
```

### 3. Rate Limiting (Nginx configured)
- Auth endpoints: 10 req/s
- API endpoints: 100 req/s
- Well-known: unlimited

### 4. CORS Configuration
```env
# Only allow your frontend domain
CORS_ORIGIN=https://app.your-domain.com
```

### 5. Database Security
```bash
# Encrypt SQLite at rest
# Use SQLite with encryption extension:
# https://www.zetetic.net/sqlcipher/
```

---

## Disaster Recovery

### Recovery Plan
1. **Backup location**: Separate server/cloud storage
2. **Recovery time objective (RTO)**: < 1 hour
3. **Recovery point objective (RPO)**: < 15 minutes

### Restore Procedure
```bash
# 1. Stop application
docker-compose down
# OR
pm2 stop suprbuild-api

# 2. Restore database
sqlite3 /app/data/suprbuild.db < /backups/latest_backup.sql

# 3. Restart
docker-compose up -d
# OR
pm2 start ecosystem.config.js --env production

# 4. Verify
curl http://localhost:3001/health
```

---

## Performance Tuning

### Node.js
```bash
# Increase file descriptors
ulimit -n 65536

# Enable clustering
# (Already configured in ecosystem.config.js)
```

### Nginx
```bash
# In nginx.conf
worker_processes auto;
worker_connections 4096;
keepalive_timeout 65;
```

### SQLite
```bash
# Optimize settings
PRAGMA cache_size = 10000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

---

## Troubleshooting

### Port conflicts
```bash
lsof -i :3001
kill -9 <PID>
```

### Database locked
```bash
# Remove lock file
rm /app/data/suprbuild.db-wal
```

### Memory leak
```bash
# Check heap usage
pm2 profile start suprbuild-api
# ... wait ...
pm2 profile stop suprbuild-api
```

### SSL certificate issues
```bash
# Check certificate
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout

# Test SSL
curl -I https://your-domain.com
```

---

## Maintenance Schedule

| Task | Frequency | Command |
|------|-----------|---------|
| Database VACUUM | Weekly | `sqlite3 suprbuild.db "VACUUM;"` |
| Log rotation | Daily | Handled by logrotate |
| Security updates | Weekly | `apt update && apt upgrade` |
| Certificate renewal | Auto | Certbot timer (30 days before expiry) |
| Database backup | Daily | Automated script |
| Health check | Real-time | Kubernetes/PM2 |

---

## Cost Optimization

### Docker (Recommended)
- **Compute**: $5-20/month (VPS with 1-2 GB RAM)
- **Bandwidth**: $0.1-0.2 per GB
- **Storage**: Database is < 1 GB for first 100k agents

### PM2 on VPS
- **Compute**: $5-20/month
- **Similar bandwidth/storage**

### Kubernetes
- **Entry**: $50-100/month (managed EKS/GKE)
- **Scales with usage**

---

## Support & Escalation

- **Issues**: https://github.com/m-Muhaimin/suprbuild-agents/issues
- **Security**: security@suprbuild.dev
- **Emergency**: oncall@suprbuild.dev

---

## Checklist

### Before Launch
- [ ] SSL certificate installed
- [ ] Database backups configured
- [ ] Rate limiting enabled
- [ ] JWT secret changed
- [ ] CORS origin configured
- [ ] Monitoring set up
- [ ] Load testing completed
- [ ] Disaster recovery tested
- [ ] Team trained on deployment

### After Launch
- [ ] Monitor metrics for 24 hours
- [ ] Verify all endpoints working
- [ ] Check error logs
- [ ] Test recovery procedure
- [ ] Document any issues

---

Generated: 2024-01-15
Version: 1.0.0
