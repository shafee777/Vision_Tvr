# Optii Platform — Production Deployment Guide

**Document Version:** 1.0.0  
**Target Environment:** Linux (Ubuntu 22.04 LTS / Debian 12)  
**Stack:** Node.js v20+ LTS, Express, SQLite (WAL mode), Nginx Reverse Proxy, Let's Encrypt SSL, PM2 Process Manager  
**Applicable Scope:** Greenfield Optii Optical Retail Platform (`c:\Users\shafe\Desktop\Projects\optii`)  

---

## 1. Production Architecture Overview

The Optii production deployment follows a hardened, resilient single-tier architecture optimized for sub-10ms response times and minimal infrastructure overhead:

```
                  ┌────────────────────────────────────────┐
                  │          Internet / Customers          │
                  └───────────────────┬────────────────────┘
                                      │ HTTPS (Port 443)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          Nginx Reverse Proxy           │
                  │   - TLS 1.3 / Let's Encrypt SSL        │
                  │   - Gzip / Brotli Compression          │
                  │   - Static Asset Caching (Cache-Control)│
                  │   - Rate Limit Proxy & Security Headers│
                  └───────────────────┬────────────────────┘
                                      │ Reverse Proxy HTTP (Port 5050)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          PM2 Process Manager           │
                  │   - Optii Node.js Application          │
                  │   - Auto-restart on crash / memory cap │
                  │   - Graceful shutdown handlers         │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │             Local Storage              │
                  │   - SQLite Database (WAL Mode)         │
                  │   - data/optii_prod.db                 │
                  │   - data/prescriptions (chmod 700)     │
                  │   - data/backups (Hourly VACUUM INTO)  │
                  └────────────────────────────────────────┘
```

---

## 2. Server Prerequisites

- **Compute:** 2 vCPU, 2GB–4GB RAM, 40GB+ NVMe SSD (e.g. AWS EC2 `t4g.small`, DigitalOcean `s-2vcpu-2gb`, or Hetzner `CX22`).
- **OS:** Ubuntu 22.04 LTS or Debian 12.
- **Domain:** Configured DNS `A` records pointing to server public IPv4 (e.g., `optii.in` and `www.optii.in`).

---

## 3. Server Provisioning & Setup

### Step 3.1: System Update & Essential Tooling
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw
```

### Step 3.2: Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Expected: v20.x.x
npm -v  # Expected: 10.x.x
```

### Step 3.3: Install Global Process Manager (PM2)
```bash
sudo npm install -g pm2
```

### Step 3.4: Configure Firewall (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

---

## 4. Application Installation & Security Permissions

### Step 4.1: Create Dedicated Service User
```bash
sudo adduser --system --group --shell /bin/bash --home /var/www optii
```

### Step 4.2: Clone Repository & Install Production Dependencies
```bash
sudo -u optii -i
git clone https://github.com/your-org/optii.git /var/www/optii
cd /var/www/optii
npm ci --only=production
```

### Step 4.3: Secure Sensitive Directories
```bash
# Ensure prescriptions and database directory are protected from unauthorized users
mkdir -p data/prescriptions data/backups
chmod 700 data/prescriptions
chmod 750 data
```

---

## 5. Production Environment Configuration (`.env`)

Generate a cryptographically secure 64-character JWT secret:
```bash
openssl rand -hex 32
```

Create `/var/www/optii/.env` (owned exclusively by `optii:optii`, `chmod 600`):
```ini
# Node Environment
NODE_ENV=production
PORT=5050

# Cryptographic Keys (MUST BE A UNIQUE 64-CHAR HEX STRING IN PRODUCTION)
JWT_SECRET=4f8b9e6a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f
JWT_EXPIRES_IN=24h

# Database Configuration (Dedicated Production Database File)
DB_PATH=./data/optii_prod.db

# WhatsApp Business Communication (E.164 format with country code)
WHATSAPP_PHONE=919876543210

# Brand & Atelier Location
STORE_NAME=Optii Atelier & Optical Clinic
STORE_ADDRESS=12 High Street, Opp. Town Hall, Thiruvarur, Tamil Nadu 610001
STORE_CITY=Thiruvarur
STORE_STATE=Tamil Nadu
STORE_PINCODE=610001
STORE_PHONE=+91 4366 220 100
STORE_HOURS=Mon - Sat: 09:30 AM - 08:30 PM, Sun: 10:00 AM - 02:00 PM

# Production Domains & CORS
CORS_ORIGIN=https://optii.in,https://www.optii.in
PUBLIC_URL=https://optii.in
```

> [!CAUTION]
> In production, `server/config/index.js` validates that `JWT_SECRET` is set and at least 32 characters long. If unset or default, the application will refuse to start with `CONFIG_VALIDATION_ERROR`.

---

## 6. Database Initialization & Seeding

Run database migrations and seed data for the production database:
```bash
# Apply SQL migrations 001 through 005
NODE_ENV=production node server/db/migrate.js

# Seed initial catalog (brands, frame shapes, lens options, store timings)
NODE_ENV=production node server/db/seed.js
```

### Immediate Password Rotation:
Log into `/admin` immediately using default credentials (`admin` / `optii123`), navigate to **Staff & Security**, and update the password to a strong 16+ character passphrase.

---

## 7. Process Management with PM2

Create `/var/www/optii/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'optii-server',
      script: 'server/index.js',
      cwd: '/var/www/optii',
      instances: 1, // Single instance required for SQLite WAL serialized transactions
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5050
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/optii/error.log',
      out_file: '/var/log/optii/out.log',
      combine_logs: true
    }
  ]
};
```

### Start Service & Configure System Boot:
```bash
# Create log directory
sudo mkdir -p /var/log/optii
sudo chown -R optii:optii /var/log/optii

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

# Register systemd startup hook
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u optii --hp /var/www
```

---

## 8. Nginx Reverse Proxy & SSL Configuration

Create `/etc/nginx/sites-available/optii.conf`:
```nginx
# Rate limiting zone for public API endpoints
limit_req_zone $binary_remote_addr zone=optii_api_limit:10m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name optii.in www.optii.in;

    # Certbot ACME Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name optii.in www.optii.in;

    # SSL Certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/optii.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/optii.in/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Max upload size (accommodates 10MB prescription PDFs/photos)
    client_max_body_size 12M;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml image/svg+xml;

    # Static Assets Caching (CSS, JS, Images, SVGs)
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|webp|woff|woff2)$ {
        root /var/www/optii/public;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    # Public Root & HTML Files
    location / {
        root /var/www/optii/public;
        try_files $uri $uri.html $uri/ @backend;
    }

    # API Endpoints Reverse Proxy
    location /api/ {
        limit_req zone=optii_api_limit burst=20 nodelay;
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Admin App Reverse Proxy Fallback
    location @backend {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Enable Site & Generate SSL Certificate:
```bash
sudo ln -s /etc/nginx/sites-available/optii.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Generate Let's Encrypt SSL
sudo certbot --nginx -d optii.in -d www.optii.in
```

---

## 9. Automated Backup & Cron Setup

Configure crontab for the `optii` user:
```bash
sudo crontab -u optii -e
```

Add automated tasks:
```cron
# 1. Hourly hot SQLite backup
0 * * * * cd /var/www/optii && /usr/bin/node scripts/backup_db.js >> /var/log/optii/backup.log 2>&1

# 2. Daily off-site cloud sync at 03:00 UTC (S3 or Cloudflare R2)
0 3 * * * aws s3 sync /var/www/optii/data/backups s3://optii-backups-production/sqlite/ >> /var/log/optii/s3-sync.log 2>&1
```

---

## 10. Zero-Downtime Deployment & Rollback Strategy

Create a deployment script at `/var/www/optii/scripts/deploy.sh`:
```bash
#!/usr/bin/env bash
set -e

echo "🚀 Starting Optii Production Deployment..."
cd /var/www/optii

# 1. Create immediate pre-deployment hot backup
node scripts/backup_db.js

# 2. Fetch latest release code
git fetch origin main
git checkout main
git pull origin main

# 3. Install dependencies
npm ci --only=production

# 4. Apply any pending database migrations
NODE_ENV=production node server/db/migrate.js

# 5. Reload application gracefully
pm2 reload optii-server

# 6. Verify health check
sleep 2
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5050/api/health)
if [ "$HEALTH_STATUS" -eq 200 ]; then
  echo "✅ Deployment Successful! Platform is healthy."
else
  echo "❌ Health check failed with status $HEALTH_STATUS! Rolling back..."
  git checkout HEAD@{1}
  pm2 reload optii-server
  exit 1
fi
```

Make executable:
```bash
chmod +x /var/www/optii/scripts/deploy.sh
```

---

## 11. Post-Deployment Verification Checklist

- [x] Application responds with HTTP 200 on `https://optii.in/`.
- [x] Canonical redirects (`http://` -> `https://`, non-www -> www or vice versa) function properly.
- [x] Security headers (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) are returned.
- [x] Product images and web fonts load from cache without 404s.
- [x] Admin login at `/admin` operates with production credentials.
- [x] Staff login role switcher and helper pills are absent in production mode.
- [x] End-to-end checkout places test order with real inventory decrement.
- [x] Hourly automated backup creates valid `.db` snapshot and `.json` manifest.
- [x] `GET /api/health` reports status `healthy` with uptime.
