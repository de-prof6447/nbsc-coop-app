# Deployment guide (VPS / shared hosting)

## Option A (recommended): VPS with Nginx + Node
### 1) Server prerequisites
- Ubuntu 22.04+
- Node.js 18+ (or 20+)
- Nginx
- PM2 (process manager)

### 2) Build frontend
On your laptop or on the VPS:
```bash
cd frontend
cp .env.example .env
# If backend is on same domain, you can use: VITE_API_BASE=/api
npm install
npm run build
```
Output: `frontend/dist`

### 3) Setup backend
```bash
cd backend
cp .env.example .env
# IMPORTANT: set JWT_SECRET to a long random value
npm install
npm run migrate
npm run seed
```

Run with PM2:
```bash
npm install -g pm2
pm2 start src/server.js --name nbsc-api
pm2 save
pm2 startup
```

### 4) Nginx (single domain serving frontend + proxy api)
- Put the built frontend files in: `/var/www/nbsc-frontend`
- Proxy `/api` to backend (localhost:4000)

Example Nginx site:
```nginx
server {
  server_name your-domain.com;

  root /var/www/nbsc-frontend;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Enable HTTPS with Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 5) Production security checklist
- Set `NODE_ENV=production`
- Set `COOKIE_SECURE=true`
- Set `JWT_SECRET` to a strong secret
- Use HTTPS (required for PWA install + secure cookies)
- Create a real admin account and remove default seed users
- Restrict server file permissions for `backend/data/nbsc.sqlite`
- Regular backups of SQLite file

## Option B: shared hosting
Most shared hosting does not allow long-running Node processes. If yours supports Node apps (cPanel Node App), you can:
- deploy `backend/`
- build `frontend/` and host static files
- set CORS_ORIGIN accordingly
- ensure HTTPS

If shared hosting cannot run Node, switch backend to Laravel/Django on that hosting environment.

## PWA install on phone
- HTTPS is required
- Open the site in Chrome
- Menu → “Add to Home screen”
- App will open in standalone mode

`frontend/` already includes PWA manifest + service worker via `vite-plugin-pwa`.
