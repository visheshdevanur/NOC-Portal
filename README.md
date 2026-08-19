# 🎓 NOC Portal — No Due Clearance Management System

> A full-stack, multi-tenant SaaS platform for managing student No Due Certificates (NDC), attendance fines, library dues, IA attendance tracking, and HDFC payment processing for higher-education institutions.

**Live Demo:** [mitmysore.in/nodue](https://mitmysore.in/nodue)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [User Roles](#user-roles)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Payment Integration](#payment-integration)
- [Multi-Tenant System](#multi-tenant-system)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Security](#security)

---

## Overview

The **NOC Portal** (No Due Clearance Portal) is an enterprise-grade, multi-tenant web application built for educational institutions. It digitizes and automates the end-to-end process of issuing No Due Certificates — replacing paper-based clearance workflows with a structured, role-gated digital pipeline.

The system tracks student dues across **attendance fines**, **library dues**, **IA attendance**, and **miscellaneous charges**, collects payments via **HDFC SmartGateway**, and issues clearance through a structured multi-stage approval workflow involving faculty, AICTE coordinators, HODs, librarians, accounts staff, the COE, and the principal.

---

## Key Features

### 🏫 Clearance Workflow
- Multi-stage clearance pipeline (Faculty → AICTE → Librarian → Accounts → HOD/FYC → Principal)
- Automatic demotion when new dues are added post-clearance
- Real-time stage tracking visible to students on their dashboard
- Hard attendance gate: students with <85% attendance AND no paid fine are blocked from clearance
- Downloadable No Due Certificate (PDF) upon full clearance

### 💰 Dues & Payments
- **Attendance Fine Management** — auto-calculated fines based on attendance shortfall, configurable per-category thresholds
- **Library Dues** — per-student book tracking with overdue fine calculation
- **Miscellaneous Dues** — manual due assignment by clerks/staff with bulk CSV support
- **HDFC SmartGateway** — fully integrated payment flow with webhook-based confirmation and HMAC verification
- PDF payment receipts generated client-side via `html2pdf.js`
- Bulk payment orders and batch-payment RPCs for mass processing
- Amount tamper detection and duplicate transaction prevention

### 📝 Internal Assessments & Attendance
- Faculty-managed IA attendance tracking per subject
- Minimum 2 IA attendance required per subject for clearance
- Multi-teacher support — same subject+section can be assigned to multiple teachers
- Co-teacher sync — changes by one teacher auto-reflect to all co-teachers
- Bulk CSV/Excel attendance upload with parallel chunked processing

### 🎓 AICTE Compliance
- AICTE Activity Coordinator role for tracking student activity status
- Tenant-scoped AICTE dashboard for managing student clearances
- Bulk CSV upload for AICTE status with RPC batching

### 👥 User Management
- Bulk CSV import of students, faculty, and staff with batch DB operations
- Role-based access control (RBAC) across 12+ distinct roles
- Parallel chunked bulk user creation via Edge Functions (bypasses timeout limits)
- Multi-teacher subject assignment — same subject+section can have multiple teachers
- Imported teacher visibility via junction table (`imported_teachers`)
- Password reset flow with session-aware routing
- Secure email change via Edge Function

### 📊 Reporting & Logs
- Per-role activity logs (Admin, HOD, Staff, FYC)
- Platform-wide error logs (Super Admin only)
- Reported issues tracking with status management
- Audit logs for sensitive mutations

### 🏢 Multi-Tenant SaaS
- Row-level tenancy via `tenant_id` on all tables
- Tenant provisioning from Super Admin portal
- Per-tenant branding (logo, primary color)
- Three billing plans: Free, Standard, Premium
- Super Admin portal for managing all tenants

### 🎨 UI/UX
- Dark/Light/System theme support (persisted per-user in DB)
- Session inactivity warning with auto-logout
- Drag-and-drop resizable panels (via `react-rnd`)
- Lazy-loaded dashboard routes for fast initial load
- Error Boundary and Tab-Error Boundary for resilient rendering
- Global sorting: students by roll number, staff by name (alphabetical)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19 + TypeScript 5.9 |
| **Build Tool** | Vite 8 |
| **Styling** | Tailwind CSS v3 + custom CSS variables |
| **Routing** | React Router v7 |
| **Data Fetching** | TanStack Query v5 (React Query) |
| **Backend / Database** | Supabase (PostgreSQL 15) |
| **Auth** | Supabase Auth (JWT-based) |
| **Edge Functions** | Supabase Edge Functions (Deno runtime) |
| **Payment Gateway** | HDFC SmartGateway |
| **PDF Generation** | html2pdf.js + jsPDF |
| **CSV/Excel Parsing** | PapaParse + xlsx |
| **Icons** | Lucide React |
| **Testing** | Vitest + Testing Library + happy-dom |
| **Deployment** | Vercel / Netlify / Apache |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React SPA (Vite)                      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│   │  Student  │  │  Staff   │  │  Admin   │  │SuperAdmin │  │
│   │Dashboard │  │Dashboard │  │Dashboard │  │  Portal   │  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│        └─────────────┴──────────────┴──────────────┘        │
│                         TanStack Query                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / JWT
┌──────────────────────────▼──────────────────────────────────┐
│                     Supabase Platform                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  PostgREST  │  │  Supabase    │  │   Edge Functions   │  │
│  │  (REST API) │  │    Auth      │  │  (Deno Runtime)    │  │
│  └──────┬──────┘  └──────────────┘  └────────┬───────────┘  │
│         │                                     │              │
│  ┌──────▼──────────────────────────────────────────────────┐│
│  │              PostgreSQL 15 Database                      ││
│  │  • Row-Level Security (RLS) on all tables                ││
│  │  • Tenant isolation via tenant_id                        ││
│  │  • 113 migrations, triggers, and stored procedures       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │    HDFC     │
                    │SmartGateway │
                    └─────────────┘
```

---

## User Roles

The system implements a hierarchical RBAC model with the following roles:

| Role | Description | Key Capabilities |
|---|---|---|
| **super_admin** | Platform owner | Manage all tenants, view error logs, provision institutions |
| **admin** | Institution admin | Manage all users, departments, semesters, bulk imports |
| **principal** | Head of institution | Final clearance approval, view all reports |
| **hod** | Head of Department | Department-level clearance, faculty management |
| **faculty** | Teaching staff | Student clearance approval, attendance entry, IA marks |
| **fyc** | First Year Coordinator | Manage first-year students, attendance fines, import teachers |
| **clerk** | Administrative clerk | Manual dues assignment, student management |
| **librarian** | Library staff | Library dues management, clearance approval |
| **accounts** | Accounts department | Payment verification, financial dues |
| **coe** | Controller of Examinations | Hall ticket management, exam clearance |
| **oe** | Open Elective Coordinator | OE subject coordination, attendance management |
| **aicte** | AICTE Activity Coordinator | Student activity compliance tracking |
| **student** | Enrolled student | View dues, make payments, download NDC |

### Clearance Pipeline

```
Student → Faculty → AICTE → Librarian → Accounts → HOD/FYC → Principal
```

---

## Project Structure

```
NOC/
├── src/
│   ├── App.tsx                    # Root router with lazy-loaded routes
│   ├── pages/
│   │   ├── Login.tsx              # Auth page with tenant resolution
│   │   ├── DashboardRouter.tsx    # Role-based dashboard dispatcher
│   │   ├── PaymentCallback.tsx    # HDFC payment return handler
│   │   ├── LibraryDashboard.tsx   # Librarian interface
│   │   ├── Logs.tsx               # Activity logs viewer
│   │   ├── UpdatePassword.tsx     # Password reset flow
│   │   └── superadmin/            # Isolated Super Admin portal
│   │       ├── SuperAdminApp.tsx
│   │       ├── SuperAdminDashboard.tsx
│   │       ├── SuperAdminLogin.tsx
│   │       ├── TenantDetailModal.tsx
│   │       ├── CreateTenantModal.tsx
│   │       ├── ErrorLogPage.tsx
│   │       └── ReportedIssuesPage.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── AdminDashboard.tsx      # Full institution management
│   │   │   ├── StudentDashboard.tsx    # Student clearance & payments
│   │   │   ├── FacultyDashboard.tsx    # Faculty approval & attendance
│   │   │   ├── HodDashboard.tsx        # HOD department management
│   │   │   ├── StaffDashboard.tsx      # Staff/Clerk operations
│   │   │   ├── FycDashboard.tsx        # First Year Coordinator
│   │   │   ├── ClerkDashboard.tsx      # Clerk operations
│   │   │   ├── AccountsDashboard.tsx   # Accounts management
│   │   │   ├── CoeDashboard.tsx        # COE module
│   │   │   ├── OECoordinatorDashboard.tsx # OE Coordinator
│   │   │   ├── AicteDashboard.tsx      # AICTE compliance
│   │   │   └── shared/
│   │   │       ├── AttendanceFinesTab.tsx
│   │   │       ├── OEDashboard.tsx
│   │   │       ├── OtherDuesTab.tsx
│   │   │       ├── DashboardPrimitives.tsx
│   │   │       └── StudentDuesOverviewTab.tsx
│   │   ├── layout/                # Shell layout with navbar
│   │   ├── ThemeProvider.tsx      # Dark/light/system theme
│   │   ├── ReportIssueModal.tsx   # In-app bug reporting
│   │   └── ContactUsModal.tsx
│   └── lib/
│       ├── supabase.ts            # Supabase client singleton
│       ├── useAuth.ts             # Auth hook with session management
│       ├── useTenant.tsx          # Tenant metadata hook
│       ├── database.types.ts      # Auto-generated DB types
│       ├── api/                   # API layer (organized by domain)
│       │   ├── faculty.ts         # Faculty clearance & attendance
│       │   ├── admin.ts           # Admin operations & teacher assignment
│       │   ├── hod.ts             # HOD operations
│       │   ├── accounts.ts        # Accounts & college dues
│       │   ├── library.ts         # Library dues processing
│       │   ├── promotion.ts       # Student promotion & section assignment
│       │   ├── aicte.ts           # AICTE compliance
│       │   └── otherDues.ts       # Miscellaneous dues
│       ├── hooks/                 # Shared React hooks
│       ├── errorHandler.ts        # Centralized error handling
│       ├── invokeWithRetry.ts     # Edge Function retry wrapper
│       ├── sanitize.ts            # Input sanitization utilities
│       └── csvSanitizer.ts        # CSV upload sanitization
├── supabase/
│   ├── functions/
│   │   ├── bulk-create-users/     # Parallel batch user creation
│   │   ├── create-user/           # Single user provisioning
│   │   ├── create-hdfc-session/   # HDFC payment session init
│   │   ├── hdfc-order-status/     # Payment status polling
│   │   ├── hdfc-webhook/          # HDFC webhook receiver
│   │   ├── admin-api/             # Admin RPC proxy
│   │   ├── change-user-email/     # Secure email updates
│   │   ├── provision-tenant/      # New tenant setup
│   │   ├── log-error/             # Platform error logger
│   │   └── _shared/               # Shared Deno utilities
│   └── migrations/                # 113 sequential SQL migrations
├── public/
│   └── .htaccess                  # Apache SPA routing fallback
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── vercel.json                    # Vercel SPA rewrite rules
├── netlify.toml                   # Netlify SPA redirect rules
└── .env.example                   # Environment variable template
```

---

## Database Schema

The PostgreSQL database has **113 sequential migrations** covering:

### Core Tables

| Table | Description |
|---|---|
| `tenants` | Institution registry for multi-tenancy |
| `profiles` | All user profiles (students, faculty, staff) |
| `departments` | Academic departments per tenant |
| `semesters` | Semester definitions per department |
| `subjects` | Subject catalog per department |
| `subject_enrollment` | Student-subject-teacher assignments (supports multi-teacher) |
| `clearance_requests` | Per-student clearance state machine |
| `student_dues` | Attendance & misc dues per student |
| `library_dues` | Library-specific dues per student |
| `other_dues` | Miscellaneous dues per student |
| `payment_orders` | HDFC payment order tracking |
| `ia_attendance` | Internal assessment attendance records |
| `attendance_fine_categories` | Configurable fine slabs per category |
| `imported_teachers` | Junction table for FYC-imported faculty |
| `section_teacher_assignments` | Section-teacher-subject assignment mapping |
| `aicte_student_clearances` | AICTE activity compliance records |
| `activity_logs` | Role-scoped audit trail |
| `audit_logs` | Sensitive-mutation audit log |
| `hall_ticket_templates` | Customizable COE hall ticket layout |
| `platform_error_logs` | Frontend runtime error tracking |

### Key Database Patterns

- **Row-Level Security (RLS)** enabled on all tables with tenant-scoped restrictive policies
- **Triggers** for auto-populating `tenant_id`, auto-creating student dues on enrollment, clearance demotion on new dues
- **Stored Procedures / RPCs** for bulk operations, atomic payment creation, and promotion/graduation logic
- **Multi-teacher support** via `UNIQUE(student_id, subject_id, teacher_id)` constraint with co-teacher sync
- **Performance indexes** on all `tenant_id`, `user_id`, and foreign key columns

---

## Supabase Edge Functions

All Edge Functions run on the **Deno runtime** and communicate via the Supabase `functions/invoke` API.

| Function | Purpose |
|---|---|
| `bulk-create-users` | Creates users in parallel chunks (avoids timeout limits); handles CSV batch imports |
| `create-user` | Single user creation with role assignment and profile bootstrapping |
| `create-hdfc-session` | Initiates an HDFC SmartGateway payment session; computes amount server-side (tamper-proof) |
| `hdfc-order-status` | Polls HDFC for payment status; validates amounts, detects duplicates, updates `payment_orders` |
| `hdfc-webhook` | Receives HDFC payment webhooks; verifies HMAC signature and marks dues as paid |
| `admin-api` | Proxies privileged admin operations (user deletion, role changes, IA data) |
| `change-user-email` | Secure email address updates for authenticated users |
| `provision-tenant` | Full tenant onboarding: creates schema seed data for a new institution |
| `log-error` | Accepts platform error reports from the frontend and stores them in `platform_error_logs` |

### Retry Strategy

All Edge Function calls from the frontend go through `invokeWithRetry.ts`, which implements exponential back-off with configurable max retries to handle transient network failures gracefully.

---

## Payment Integration

The NOC Portal uses **HDFC SmartGateway** for payment collection.

### Flow

```
Student clicks "Pay"
      │
      ▼
Frontend calls create-hdfc-session (Edge Function)
      │  Amount computed SERVER-SIDE from DB (never trusts client)
      │  HDFC credentials stored only in Edge Function secrets
      ▼
Edge Function creates order → returns payment page URL
      │
      ▼
Student redirected to HDFC payment page
      │
      ▼
HDFC posts webhook → hdfc-webhook Edge Function
      │  Verifies HMAC signature
      │  Validates amount matches stored order
      ▼
payment_orders table updated → student_dues marked paid
      │
      ▼
Student redirected to /payment/callback
      │
      ▼
PaymentCallback.tsx polls hdfc-order-status → renders receipt
```

### Security Notes

- **No HDFC credentials are ever exposed to the browser.** All API keys (`HDFC_API_KEY`, `HDFC_MERCHANT_ID`, `HDFC_RESELLER_ID`) are stored exclusively as Supabase Edge Function secrets.
- **Server-side amount computation** — amounts are always derived from database records, never from client input.
- **Amount tamper detection** — response amounts are compared against stored orders; mismatches are flagged as `TAMPERED`.
- **Duplicate transaction prevention** — `txn_id` is checked for reuse across orders.
- Webhook signature is verified using HMAC before any state change.
- Payment orders are created atomically via an RPC to prevent double-booking.

---

## Multi-Tenant System

The portal supports multiple institutions on a single database using **Row-Level Tenancy** (Option B architecture).

### How It Works

1. Every data table has a `tenant_id UUID` column referencing the `tenants` table.
2. A `get_my_tenant_id()` SQL function resolves the current user's tenant from their `profiles` row.
3. All RLS policies include a `tenant_id = get_my_tenant_id()` clause, ensuring complete data isolation.
4. New tenants are provisioned by the Super Admin via the `provision-tenant` Edge Function, which seeds departments, semesters, and a default admin account.

### Tenant Plans

| Plan | Max Users | Features |
|---|---|---|
| `free` | 500 | Core clearance workflow |
| `standard` | Configurable | + Payment gateway |
| `premium` | Unlimited | + All features, custom branding |

### Super Admin Portal

Accessible at `/nodue/superadmin`, the Super Admin portal is **completely isolated** from the main application — it uses its own Supabase client, auth flow, and UI. It provides:
- Dashboard of all tenants with health stats
- Tenant creation and suspension
- Platform-wide error log viewer
- Reported issues management

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A [Supabase](https://supabase.com) project
- (Optional) HDFC SmartGateway merchant credentials for payment features

### 1. Clone the Repository

```bash
git clone https://github.com/visheshdevanur/NOC-Portal.git
cd NOC-Portal
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see [Environment Variables](#environment-variables)).

### 4. Apply Database Migrations

Using the Supabase CLI:

```bash
supabase db push
```

Or apply migrations manually via the Supabase SQL editor in order from `0001_initial_schema.sql` to the latest.

### 5. Deploy Edge Functions

```bash
supabase functions deploy bulk-create-users
supabase functions deploy create-user
supabase functions deploy create-hdfc-session
supabase functions deploy hdfc-order-status
supabase functions deploy hdfc-webhook
supabase functions deploy admin-api
supabase functions deploy change-user-email
supabase functions deploy provision-tenant
supabase functions deploy log-error
```

Set Edge Function secrets:

```bash
supabase secrets set HDFC_API_KEY=...
supabase secrets set HDFC_MERCHANT_ID=...
supabase secrets set HDFC_RESELLER_ID=hdfc_reseller
supabase secrets set HDFC_PAYMENT_PAGE_CLIENT_ID=...
supabase secrets set HDFC_BASE_URL=https://smartgateway.hdfc.bank.in
supabase secrets set HDFC_WEBHOOK_USERNAME=...
supabase secrets set HDFC_WEBHOOK_PASSWORD=...
supabase secrets set PAYMENT_RETURN_URL=https://yourdomain.com/nodue/payment/callback
supabase secrets set ALLOWED_ORIGIN=https://yourdomain.com
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

### 6. Run Development Server

```bash
npm run dev
```

The app is served at `http://localhost:5173/nodue` (base path: `/nodue`).

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Supabase anonymous/public key |
| `VITE_BASE_PATH` | `.env` | Custom base route (default: `/nodue/`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function secrets | Service role key for privileged operations |
| `HDFC_API_KEY` | Edge Function secrets | HDFC merchant API key |
| `HDFC_MERCHANT_ID` | Edge Function secrets | HDFC merchant ID |
| `HDFC_RESELLER_ID` | Edge Function secrets | HDFC reseller ID (default: `hdfc_reseller`) |
| `HDFC_PAYMENT_PAGE_CLIENT_ID` | Edge Function secrets | HDFC payment page client ID |
| `HDFC_BASE_URL` | Edge Function secrets | HDFC gateway URL (UAT or Production) |
| `HDFC_WEBHOOK_USERNAME` | Edge Function secrets | Webhook basic auth username |
| `HDFC_WEBHOOK_PASSWORD` | Edge Function secrets | Webhook basic auth password |
| `PAYMENT_RETURN_URL` | Edge Function secrets | Callback URL after payment |
| `ALLOWED_ORIGIN` | Edge Function secrets | CORS allowed origin for Edge Functions |

> ⚠️ **Never** put HDFC credentials or the service role key in `VITE_` prefixed variables — they would be exposed in the browser bundle.

---

## Deployment

### Vercel (Recommended)

The project includes a `vercel.json` with SPA rewrite rules. Simply:

1. Connect your GitHub repo to Vercel.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel dashboard.
3. Deploy. All routes under `/nodue/*` are rewritten to `/nodue/index.html`.

### Netlify

A `netlify.toml` is included with equivalent redirect rules:

```bash
npm run build
# Deploy the dist/ folder to Netlify
```

### Apache / cPanel Hosting

A `.htaccess` file is included in `public/` that configures SPA fallback routing for Apache servers.

### Build for Production

```bash
npm run build
```

Output is in the `dist/` directory.

---

## Security

The NOC Portal was designed with security as a first-class concern:

- **Row-Level Security (RLS)** — All database tables have RLS enabled. No data is accessible without appropriate policies.
- **Tenant Isolation** — Restrictive RLS policies ensure users from one institution can **never** access another institution's data.
- **No frontend secrets** — Payment credentials live only in Edge Function secrets. The browser never sees them.
- **Server-side amount computation** — Payment amounts are computed from DB records, not client input. Tampered amounts are flagged.
- **Input Sanitization** — All CSV uploads and user inputs pass through `csvSanitizer.ts` and `sanitize.ts` before hitting the database.
- **Search Path Hardening** — All stored procedures set `search_path = public, pg_catalog` explicitly to prevent schema injection.
- **HMAC Webhook Verification** — HDFC webhook payloads are verified with HMAC signatures before state changes.
- **Session Management** — Inactivity detection with a 2-minute warning and auto-logout.
- **Audit Logs** — Sensitive mutations (deletions, role changes, payment confirmations) are tracked in `audit_logs`.
- **Error Boundary** — React error boundaries prevent cascading UI crashes and surface errors gracefully.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server at `localhost:5173` |
| `npm run build` | Build production bundle to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on all source files |

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request.

Please follow the existing code style (TypeScript strict mode, no `any` types, all Supabase queries must be tenant-scoped).

---

## License

This project is proprietary software developed for **Maharaja Institute of Technology, Mysore** and its affiliated institutions. All rights reserved.

---

<div align="center">
  <p>Built with ❤️ for MIT Mysore &nbsp;|&nbsp; Powered by Supabase + React + HDFC SmartGateway</p>
</div>
