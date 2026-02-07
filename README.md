# NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA (NBSC Kaduna)
Mobile-friendly cooperative management web app (PWA-ready).

## Structure
- `backend/` Node.js + Express + SQLite REST API (JWT in HttpOnly cookie)
- `frontend/` React (Vite) + Tailwind + PWA (vite-plugin-pwa)

## Quick start (dev)
### 1) Backend
```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## Default test users (created by seed)
- Admin: SAP `ADMIN001`, password `Admin@1234`
- Member: SAP `100001`, password `Member@1234`
- Member: SAP `100002`, password `Member@1234`

> Change passwords after first login.

## Production build
```bash
cd frontend && npm run build
# copy `frontend/dist` to backend public folder (optional) or serve via nginx
```

## Data model note
Your required schema is implemented exactly:
- `members`
- `thrift_loan_repayment`

Internally, loan balances and summaries are computed from `thrift_loan_repayment` entries using:
- `description = 'THRIFT'` for contributions
- `description = 'LOAN_DISBURSEMENT'` for loan release
- `description = 'LOAN_REPAYMENT'` for repayments
