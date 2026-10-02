# Apex ERP

Internal ERP: Helpdesk (repair tickets), Inventory, Procurement (PR → approval → PO → goods receipt), Employees & IT assets, user accounts with per-person permissions, and an append-only Audit Log.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Prisma 6 · PostgreSQL. UI uses the *Classical* design system (`src/app/classical.css`) with theme overrides (blue accent in light mode, gold on warm black in dark mode).

## Getting started

```bash
cp .env.example .env            # set DATABASE_URL to your Postgres
npm install
npx prisma migrate deploy       # create tables (+ audit-log immutability triggers)
npm run db:seed                 # sample data — demo accounts use password 1234
npm run dev                     # http://localhost:3000
```

Production: `npm run build && npm start`. Serve over HTTPS (session cookies are `Secure` in production; see `COOKIE_SECURE`).

Demo accounts: `admin`, `manager`, `executive`, `itmanager`, `somchai`, `pakorn` (IT Support), `wiphada` (Store Keeper), `surachai`, `natthida` (Employee). **Set `SHOW_DEMO_ACCOUNTS=false` in production** and change the seeded passwords (or don't seed).

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

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) for who owns which menu, shared files, and migration rules.

## Layout

```
prisma/schema.prisma          data model; migrations/…_init adds audit-log + stock CHECK constraints
prisma/seed.ts                sample data
src/lib/domain.ts             roles, default permissions (RBAC), statuses, SLA, approval rules, formatting
src/server/auth.ts            sessions (hashed tokens), permission guards, audit()
src/server/actions/*.ts       every mutation — permission-checked, transactional, audited
src/server/queries.ts         nav badges + bell notifications
src/app/(app)/<module>/       one route per menu item (page.tsx = server data, view.tsx = client UI)
src/app/api/files/[id]        authenticated ticket-photo download
src/app/api/audit             audit-log CSV export
```

| Menu | Route | Default roles |
|---|---|---|
| แดชบอร์ดภาพรวม | `/dashboard` | Manager, Executive, Admin |
| แจ้งปัญหา / คำร้องของฉัน | `/tickets/new`, `/tickets/mine` | everyone |
| ศูนย์มอบหมายงาน | `/dispatch` | IT Manager, Admin |
| งานที่ได้รับมอบหมาย | `/work` | IT Support, Admin |
| คลังสินค้า | `/inventory` | Store Keeper, IT Support (view only), Admin |
| ใบขอซื้อ / ใบสั่งซื้อ | `/purchase` | Store Keeper, Admin |
| อนุมัติการสั่งซื้อ | `/approvals` | Manager, Executive, Admin |
| ข้อมูลพนักงาน & อุปกรณ์ | `/employees` | IT Support, Admin |
| ทะเบียนทรัพย์สิน | `/assets` | IT Support, IT Manager, Admin |
| บัญชีผู้ใช้ & สิทธิ์ | `/users` | Admin |
| Audit Log | `/audit` | Manager, Executive, Admin |

Admins can add or remove modules per person on top of the role defaults.

## Business rules (as designed)

- **Tickets:** new → assigned → in progress / waiting for parts → resolved → requester confirms with a 1–5★ rating (or "ยังไม่หาย" sends it back). SLA: critical 4 h, high 8 h, medium 24 h, low 72 h.
- **Parts withdrawal** decrements stock immediately (never below zero, even under concurrent requests), records it on the ticket, and alerts when at/below the reorder point.
- **Procurement:** PR → Manager approval (if total incl. VAT > `APPROVAL_LIMIT`, then a *different* Executive) → PO printable as PDF → "รับเข้าคลัง" adds stock. Requesters can't approve their own PR. Items with an open PR aren't suggested again.
- **Assets:** one holder per tag; returning or deleting an employee sends devices back to IT storage with custody history kept.
- **Audit log:** every change, login (including failures) and CSV export is recorded with before → after detail. A database trigger rejects UPDATE/DELETE/TRUNCATE on `AuditLog`.

## Security notes

- Passwords are bcrypt-hashed. Sessions are random tokens stored hashed in the DB, and every page and action re-checks the user and their permissions on the server. Suspending a user or resetting their password signs them out.
- Segregation-of-duties checks are enforced server-side for both approving and rejecting purchase requests.
- Ticket photos are type-checked by magic bytes and served only to the requester, dispatchers, and the assigned technician.
- The audit log can't be edited or deleted, so there is no in-app "reset data" — re-seed a fresh database instead. CSV export neutralises spreadsheet-formula injection.
