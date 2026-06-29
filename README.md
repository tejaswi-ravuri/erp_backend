# MasterMinds ERP — Backend

Node.js + Express + MongoDB (Mongoose) backend, built to replace the Base44
platform the frontend was originally scaffolded against. Designed for a
multi-branch institution with strict per-branch data isolation and 5 active
roles (Super Admin is built but disabled).

## 1. Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env: at minimum set MONGO_URI and the two JWT secrets
npm run seed     # creates a Super Admin (inactive) + one Principal login
npm run dev      # nodemon, http://localhost:5000
```

Generate strong JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

After seeding, log in as the seeded Principal (`POST /api/auth/login`) and use
`POST /api/auth/users` to create the Admin Officer, Accounts Manager, Teacher,
and Student accounts for that branch. Repeat `npm run seed` logic manually
(or just use the Principal account) for each of your other branches.

## 2. Architecture at a glance

```
server.js                 entry point
src/
  config/                 db connection, cloudinary config, shared constants
  models/                 one Mongoose schema per entity + User
  rbac/permissions.js     <-- the single source of truth for who can do what
  middleware/
    auth.js               JWT verification, loads req.user
    branchScope.js         <-- the single source of truth for branch isolation
    upload.js, errorHandler.js
  controllers/            entityController (generic CRUD factory), authController,
                          analyticsController, uploadController
  routes/                 authRoutes, entityRoutes, analyticsRoutes, uploadRoutes
```

**Two files matter most for security and are worth reading first:**
`src/rbac/permissions.js` (who can do what to which entity) and
`src/middleware/branchScope.js` (how branch isolation and student/teacher
self-scoping are enforced on every single query — not just suggested by the UI).

## 3. Auth

JWT access token (15 min) + refresh token (7 days). `POST /api/auth/login`
returns both; send the access token as `Authorization: Bearer <token>` on
every other request. `POST /api/auth/refresh` exchanges a refresh token for a
new pair. Logging out (`POST /api/auth/logout`) bumps a version counter on the
user, invalidating every outstanding refresh token for that account immediately.

This **replaces** the old `RoleLogin.jsx` role-picker and the password-less
Student Portal admission-number lookup — every role now requires a real
email + password login, and the server (not `localStorage`) is the only
source of truth for who someone is.

## 4. Branch isolation (strict, server-enforced)

Every entity carries a `branch` field. On every list/read/update/delete:

- **Principal, Admin Officer, Teacher, Student** → query is force-filtered to
  `req.user.branch`. A client cannot override this by passing a different
  `branch` in the query string or body — the server filter always wins.
- **Accounts Manager, Super Admin** → no branch filter by default (see all
  branches); they may pass `?branch=Hyderabad` to drill into one branch.
- On **create**, branch-locked roles always get `branch` forced to their own
  branch server-side, regardless of what's in the request body. Cross-branch
  roles must specify a branch explicitly.
- On **update**, `branch` can never be changed via the entity endpoints — it's
  stripped from the payload — so a record can't be moved between branches by
  mistake or by a compromised client.

## 5. RBAC matrix (summary — full detail in `src/rbac/permissions.js`)

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Admission | Principal, Admin Officer | + Accounts Manager | Principal, Admin Officer | Principal |
| Student | Principal, Admin Officer | + Teacher, Accounts Manager, **own record only for Student** | Principal, Admin Officer | Principal |
| Staff | Principal, Admin Officer | + Accounts Manager, Teacher | Principal, Admin Officer | Principal |
| Attendance | Teacher, Principal, Admin Officer | + Accounts Manager, **own only for Student** | Teacher, Principal, Admin Officer | Principal, Admin Officer |
| Marks | Teacher, Principal | + Admin Officer, Accounts Manager, **own only for Student** | Teacher, Principal | Teacher, Principal |
| FeePayment | Admin Officer, Accounts Manager | + Principal, **own only for Student** | Admin Officer, Accounts Manager | Admin Officer, Accounts Manager, Principal |
| Income / Expenditure | Admin Officer, Accounts Manager(, Principal for Expenditure) | same + Principal | same | same |
| Event | Principal, Admin Officer | everyone | Principal, Admin Officer | Principal, Admin Officer |

`super_admin` can always do everything everywhere (currently disabled — see
`SUPER_ADMIN_ENABLED` in `src/config/constants.js`).

## 6. Analytics (`/api/analytics/*`)

Dedicated aggregation endpoints, not just raw CRUD — every one branch-scoped
the same way as entities:

- `GET /overview` — headline counts + this month's fee collection + today's attendance
- `GET /fees-summary` — by fee type, by month, by status, by class
- `GET /attendance-summary` — overall %, by class, daily trend
- `GET /academic-performance` — average % by subject/class, score distribution
- `GET /income-expenditure` — monthly trend, by category, net
- `GET /admissions-funnel` — funnel by form_status, by class sought
- `GET /branch-comparison` — **Accounts Manager / Super Admin only** — the real
  cross-branch comparison your Accounts Manager dashboard was previously mocking

## 7. File uploads (`/api/upload/:category`)

`category` is `students`, `staff`, or `documents`. Saves to local disk under
`uploads/` first (this is the primary copy the app serves from via
`/uploads/...` static route). If Cloudinary credentials are present in `.env`,
also pushes a non-blocking backup copy — if that fails or isn't configured,
the upload still succeeds using the local copy only.

## 8. Deploying

This app has no platform-specific code — it'll run anywhere Node + MongoDB
are available:
- **VPS** (EC2, DigitalOcean, etc.): `npm install --production`, run with
  `pm2` or a systemd service, point nginx at it, mount `uploads/` on
  persistent disk (and ideally back it up — Cloudinary backup helps but isn't
  a replacement for real backups of your primary store).
- **PaaS** (Render/Railway): works as-is, but their filesystems are usually
  ephemeral — if you go this route, local disk storage stops being reliable
  across deploys/restarts and you'd want to make Cloudinary (or S3) the
  primary store, not just a backup. Flag this if you land on a PaaS so we can
  flip that priority.
- **MongoDB**: either run your own (VPS/Docker) or use MongoDB Atlas
  (works from anywhere, including most PaaS).

## 9. What's NOT in this build yet (intentionally — flag if you want them)

- `InvokeLLM` (used by the old timetable generator) — needs a real LLM API
  key (Anthropic/OpenAI) wired into a small `/api/ai/*` route. Not built yet
  since it's a "nice to have" feature, not core data/analytics.
- Email sending (`nodemailer`) — package is installed but no routes call it
  yet; tell me which notifications you want (fee due reminders, homework
  notices, etc.) and I'll wire them up.
- Audit log viewer UI — `created_by`/`updated_by`/`deleted_at` are tracked on
  every record already, just not exposed as a dedicated report yet.
