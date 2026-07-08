# DevPerf System

Base scaffold for the Developer Performance & Contribution Evaluation System described in [claude.MD](claude.MD).

Stack: **NestJS + TypeORM + PostgreSQL** (backend), **React + Vite + Ant Design** (frontend).

## Structure

```
backend/    NestJS REST API (RBAC-protected, /api/docs Swagger UI)
frontend/   React SPA (Ant Design dashboards for Developer and PM/HR roles)
```

## Backend setup

```bash
cd backend
cp .env.example .env      # edit DB credentials / JWT secret
npm install
npm run start:dev
```

Requires a running PostgreSQL instance matching `.env`. Tables are created automatically via TypeORM `synchronize` in development — use real migrations before production (see `npm run migration:generate` / `migration:run`).

API is served at `http://localhost:3000/api`, Swagger docs at `http://localhost:3000/api/docs`.

There's no seed script yet — create the first employee directly via SQL (bcrypt-hash the password) or temporarily relax the `@Roles(Role.HR, Role.ADMIN)` guard on `POST /employees` to bootstrap your first ADMIN account.

## Frontend setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Runs at `http://localhost:5173`, proxying `/api` to the backend at `http://localhost:3000`.

## What's implemented

- **Auth**: JWT login, global `JwtAuthGuard` + `RolesGuard`, `@Public()` / `@Roles()` decorators.
- **Employees**: CRUD, level tracking with `levelEffectiveDate`.
- **Skill Matrix**: current/learning skills, dev self-declaration, PM/Tech Lead approval flow, key-skill (e.g. English) multiplier.
- **Bench Time**: activity logging, PM review/outcome scoring, idle-bench alert endpoint.
- **Task/Project History**: task records with estimate vs. actual, complexity, PM rating, bug count.
- **Evaluations**: weighted scoring engine per `claude.MD` §4 (`backend/src/evaluations/scoring`), with pro-rated weight blending across levels for the mid-period level-change edge case called out in §6.
- **Frontend**: login, role-aware layout/menu, Developer dashboard (score summary, skill radar chart, learning progress, bench log), PM dashboard (resource table, idle-bench alerts).

## Not yet implemented (next steps)

- Seed/migration scripts, integration tests.
- Task assignment UI, evaluation-run UI (the scoring endpoint exists; there's no admin screen to trigger it yet).
- Roadmap/suggestion engine (Junior → Middle skill-gap suggestions) mentioned in §5.3.
- Refresh tokens / password reset.
