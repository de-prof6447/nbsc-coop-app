# NBSC Kaduna API (REST)

Base URL: `/api`

All endpoints use **JWT stored in HttpOnly cookie**. Frontend must call fetch with `credentials: 'include'`.

## Auth
- `POST /auth/login`
  - Body: `{ "sap_no": "100001", "password": "..." }`
  - 200: `{ sap_no, full_name, role }`
- `POST /auth/logout` → 200 `{ ok: true }`
- `GET /auth/me` → 200 `{ user: { sap_no, full_name, phone_no, role } }`
- `POST /auth/change-password`
  - Body: `{ "current_password": "...", "new_password": "..." }`

## Members (Admin)
- `GET /members?q=...` → list (max 200)
- `POST /members` create
- `PUT /members/:sap_no` update
- `POST /members/:sap_no/reset-password` body `{ "new_password": "..." }`
- `DELETE /members/:sap_no`
- `POST /members/bulk-delete` body `{ "sap_nos": ["100001","100002"] }`

## Records
> Members can only view their own records (server-enforced). Admin can query any.

- `GET /records/dashboard`
  - Member: ignores query params → returns own dashboard
  - Admin: optional `?sap_no=100001`
- `GET /records`
  - Member: returns own records
  - Admin: requires `?sap_no=...`
- `POST /records` (Admin only)
  - Body:
    - `{ "sap_no":"100001", "date":"2026-02-01", "description":"THRIFT|LOAN_DISBURSEMENT|LOAN_REPAYMENT", "amount":10000, "remark":"" }`
- `DELETE /records/:record_id` (Admin only)

## Admin utilities
- `POST /admin/import/members` multipart/form-data key `file` (CSV)
- `POST /admin/import/records` multipart/form-data key `file` (CSV)
- `POST /admin/danger/clear-database` body `{ "confirm":"CLEAR" }` (removes records only)
- `POST /admin/danger/delete-members` body `{ "confirm":"DELETE_ALL_MEMBERS" }` (keeps admins)

## Statements (PDF)
- `GET /statements/pdf` (Member own; Admin can pass `?sap_no=...`)
