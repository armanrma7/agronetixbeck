# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- Supabase project with Postgres database
- VPS with static IP
- SMS provider credentials (MSG91 or similar)

## Step 1: Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL script from `database/migrations.sql`
4. Verify tables are created:
   - `users`
   - `otp_codes`

## Step 2: Environment Configuration

1. Copy `.env.example` to `.env`
2. Fill in all required values:

```bash
# Database (Supabase Postgres)
DB_HOST=db.your-project.supabase.co
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-db-password
DB_DATABASE=postgres

# Supabase (for future use if needed)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT (generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# SMS Provider
SMS_PROVIDER=msg91
MSG91_API_KEY=your-msg91-api-key
MSG91_SENDER_ID=ACRONET

# OTP Settings
OTP_EXPIRY_SECONDS=60
OTP_MAX_ATTEMPTS=5
```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Build Application

```bash
npm run build
```

## Step 5: Production Configuration

1. Set `NODE_ENV=production` in `.env`
2. Set `synchronize: false` in `app.module.ts` (already configured)
3. Ensure SSL is enabled for database connection

## Step 6: Run Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run start:prod
```

### Using PM2 (Recommended for VPS)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/main.js --name acronetxbeck-auth

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

## Step 7: Nginx Configuration (Optional)

If using Nginx as reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Step 8: Firewall Configuration

```bash
# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Allow application port (if not using reverse proxy)
sudo ufw allow 3000/tcp
```

## Step 9: SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com
```

## Health Check

- Application: `http://your-domain.com/api`
- Swagger Docs: `http://your-domain.com/api`

## Monitoring

- Set up log rotation
- Monitor application logs: `pm2 logs acronetxbeck-auth`
- Monitor database connections
- Set up alerts for errors

## Backup Strategy

1. Database backups (Supabase handles this, but set up additional backups)
2. Environment variables backup (store securely)
3. Application logs backup

## Security Checklist

- [ ] Strong JWT secret
- [ ] Database credentials secured
- [ ] SMS provider credentials secured
- [ ] HTTPS enabled
- [ ] CORS configured properly
- [ ] Rate limiting (consider adding)
- [ ] Input validation enabled (already configured)
- [ ] SQL injection protection (TypeORM handles this)

