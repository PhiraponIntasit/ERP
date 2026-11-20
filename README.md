# IT Products Store Management System

IT products store management: the COREPICK storefront (catalogue, cart, PC builder, PromptPay checkout, customer accounts and warranty claims) and its back office — orders & fulfilment, Inventory (stock, reorder points, adjustments), Procurement (PR → approval → PO → goods receipt), after-sales service (claims with technicians, repair or replacement), coupons, sales reports, user accounts with per-person permissions, and an append-only Audit Log.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Prisma 6 · PostgreSQL. UI uses the *Classical* design system (`src/app/classical.css`) with theme overrides (blue accent in light mode, gold on warm black in dark mode).

## Getting started

```bash
cp .env.example .env            # set DATABASE_URL to your Postgres
npm install
npx prisma migrate deploy       # create tables (+ audit-log immutability triggers)
npm run db:seed                 # sample data — demo accounts use password 1234
npm run dev                     # http://localhost:3000
```

`npm run dev` regenerates the Prisma client first and warns if your database is missing migrations (`scripts/predev.mjs`). After pulling changes that touch `prisma/` or `package.json`, run `npm install` and `npx prisma migrate deploy`.

Production on Vercel: see [docs/DEPLOY.md](docs/DEPLOY.md). Self-hosted: `npm run build && npm start`. Serve over HTTPS (session cookies are `Secure` in production; see `COOKIE_SECURE`).

Demo accounts: `admin`, `manager`, `executive`, `wiphada` (Store Keeper), `itmanager` (หัวหน้าช่าง), `somchai`, `pakorn` (ช่างเทคนิค); storefront customer `customer@example.com`. (`surachai`, `natthida` were helpdesk requesters and are suspended.) **Set `SHOW_DEMO_ACCOUNTS=false` in production** and change the seeded passwords (or don't seed).

To start over with fresh sample data, point `DATABASE_URL` at a new empty database and run `migrate deploy` + `db:seed`, or use `npm run db:reset` on a development database (this drops all data).

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `APPROVAL_LIMIT` | `50000` | PR total incl. VAT above which Manager **and** Executive must approve |
| `REORDER_FACTOR` | `3` | Suggested order qty = reorder point × factor − on hand |
| `DEFAULT_THEME` | `light` | Theme for users who never toggled |
| `SHOW_DEMO_ACCOUNTS` | `false` | One-click demo sign-in on the login page |
| `DISPLAY_TZ` | `Asia/Bangkok` | Time zone for all dates and dashboard day buckets |
| `UPLOAD_DIR` | `./storage/uploads` | Ticket photo storage (outside `public/`) |
| `COOKIE_SECURE` | prod: `true` | Set `false` only for plain-HTTP intranet hosting |
| `APP_URL` | dev: `http://localhost:3000` | Public URL used in emailed links. **Required in production** |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | Any SMTP server, for "ลืมรหัสผ่าน" emails. Unset in dev → emails print to the server console |
| `MAIL_FROM` | `SMTP_USER` | Sender address |
| `MAIL_OUTBOX_DIR` | dev: `./storage/outbox` | When there's no SMTP, emails are written here as JSON instead of sent (used by the e2e tests). Leave unset in production |

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) for who owns which menu, shared files, and migration rules.

## Layout

```
prisma/schema.prisma          data model; migrations/…_init adds audit-log + stock CHECK constraints
prisma/seed.ts                sample data
src/lib/domain.ts             roles, default permissions (RBAC), statuses, approval rules, formatting
src/server/auth.ts            sessions (hashed tokens), permission guards, audit()
src/server/actions/*.ts       every mutation — permission-checked, transactional, audited
src/server/queries.ts         nav badges + bell notifications
src/app/(app)/<module>/       one route per menu item (page.tsx = server data, view.tsx = client UI)
src/app/api/claims/images/[id] claim photos (staff with the claims menu, or the customer who owns the claim)
src/app/api/audit             audit-log CSV export
```

| Menu | Route | Default roles |
|---|---|---|
| แดชบอร์ดภาพรวม | `/dashboard` | Manager, Executive, Admin |
| คลังสินค้า | `/inventory` | Store Keeper, Admin (ช่างเทคนิค / หัวหน้าช่าง view only) |
| คำสั่งซื้อ & จัดส่ง | `/orders` | Store Keeper, Manager, Admin |
| คูปองส่วนลด · รายงานยอดขาย | `/coupons` · `/sales` | Manager, Admin (รายงาน: + Executive) |
| ตรวจประกัน · เคลมสินค้า | `/warranty` · `/claims` | Store Keeper, Manager, ช่างเทคนิค, หัวหน้าช่าง, Admin |
| ลูกค้า | `/customers` | Manager, Admin |
| สินค้า & ราคาขาย | `/products` | Store Keeper, Admin |
| ใบขอซื้อ / ใบสั่งซื้อ | `/purchase` | Store Keeper, Admin |
| อนุมัติการสั่งซื้อ | `/approvals` | Manager, Executive, Admin |
| บัญชีผู้ใช้ & สิทธิ์ | `/users` | Admin |
| Audit Log | `/audit` | Manager, Executive, Admin |

Admins can add or remove modules per person on top of the role defaults.

## Business rules (as designed)

- **Claims (after-sales):** the customer files on a unit they bought (with photos) → the shop receives it and assigns a technician → the technician logs findings (for the customer or internal, with photos) → repair & return (spare parts leave stock), replace from stock, or reject. More than 7 days after receipt without a decision is flagged overdue. The old internal IT helpdesk was retired; its tickets stay in the database as history.
- **Stock** never goes below zero or below units reserved for unpaid orders, even under concurrent requests; write-offs and counts need a reason and are audited.
- **Procurement:** PR → Manager approval (if total incl. VAT > `APPROVAL_LIMIT`, then a *different* Executive) → PO printable as PDF → "รับเข้าคลัง" adds stock. Requesters can't approve their own PR. Items with an open PR aren't suggested again.
- **Staff contacts:** each account keeps its work email (notifications, password reset), phone (shown to technicians) and department, edited on บัญชีผู้ใช้ & สิทธิ์.
- **Audit log:** every change, login (including failures) and CSV export is recorded with before → after detail. A database trigger rejects UPDATE/DELETE/TRUNCATE on `AuditLog`.

## Security notes

- Passwords are bcrypt-hashed. Sessions are random tokens stored hashed in the DB, and every page and action re-checks the user and their permissions on the server. Suspending a user or resetting their password signs them out.
- Segregation-of-duties checks are enforced server-side for both approving and rejecting purchase requests.
- Ticket photos are type-checked by magic bytes and served only to the requester, dispatchers, and the assigned technician.
- The audit log can't be edited or deleted, so there is no in-app "reset data" — re-seed a fresh database instead. CSV export neutralises spreadsheet-formula injection.
