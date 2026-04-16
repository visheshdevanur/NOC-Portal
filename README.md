# 🎓 NOC Portal — No Due Clearance System

A comprehensive, role-based **No-Due Clearance Portal** built for educational institutions. It digitizes and automates the entire student clearance pipeline — from faculty attendance reviews to hall ticket generation — replacing manual paperwork with a real-time, multi-stage approval workflow.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000?logo=vercel&logoColor=white)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Clearance Pipeline](#clearance-pipeline)
- [Role-Based Dashboards](#role-based-dashboards)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Database Migrations](#database-migrations)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

NOC Portal provides a **fully automated, multi-stage clearance system** for educational institutions. Students apply for clearance, and their request flows through a defined pipeline of approvals — faculty attendance review, accounts fee verification, college dues clearance, and HOD final approval — before they can download their examination hall ticket.

The system supports **7 distinct user roles**, each with a dedicated dashboard and specific permissions enforced via Supabase Row Level Security (RLS).

---

## Clearance Pipeline

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│   Student    │────▶│     Faculty      │────▶│   Accounts   │────▶│ College Dues │────▶│    HOD     │
│   Applies    │     │ IA + Attendance  │     │Fee Verification│   │  Clearance   │     │  Approval  │
└─────────────┘     └──────────────────┘     └──────────────────┘ └──────────────┘     └──────────────┘
                                                                                              │
                                                                                              ▼
                                                                                     ┌────────────────┐
                                                                                     │  🎫 Hall Ticket │
                                                                                     │   Download     │
                                                                                     └────────────────┘
```

### Pipeline Stages

| Stage | Role | Action |
|-------|------|--------|
| **Faculty Review** | Faculty/Teacher | Enter attendance %, mark IA attendance, approve/reject subjects |
| **Accounts Review** | Accounts | Verify attendance fee payments (for students who paid fines) |
| **Department Review** | Accounts | Clear college-level dues and fees |
| **HOD Review** | HOD | Final sign-off on clearance |
| **Cleared** | Student | Download hall ticket PDF |

---

## Role-Based Dashboards

### 👨‍🎓 Student Dashboard
- View clearance pipeline progress (4-step stepper with real-time updates)
- Track faculty clearance status per subject
- View IA attendance eligibility (minimum 2 IAs required)
- Monitor accounts and college dues status
- Download hall ticket PDF (with custom or legacy template)

### 👨‍🏫 Faculty Dashboard
- **Student Clearance** — Enter attendance %, auto-approve (≥85%) or reject (<85%)
- **Manage IAs** — Record Internal Assessment attendance per subject
- CSV upload/download support for bulk attendance entry
- Semester and section-based filtering

### 🏢 Staff Dashboard
- **Attendance Fines** — Override faculty rejections with fee amount entry
- **Student Dues** — Manage department-level student dues
- **User Management** — Create/manage student accounts
- **Semesters & Subjects** — Manage academic structure
- **Semester Promotion** — Bulk promote students to next semester

### 💰 Accounts Dashboard
- **Fee Verification** — Verify attendance fee payments (with bulk verify)
- **College Dues** — Manage and clear student financial dues
- **Staff Approvals** — View staff-approved fee overrides
- Department-based filtering and manual fee entry

### 👔 HOD Dashboard
- **Clearances** — Final approval of student clearance requests (with bulk approve)
- **Fine Approvals** — Review staff-approved attendance fines
- **Staff & Teachers** — Create/manage department staff and teachers
- **Teacher Details** — View teacher-subject assignments
- **Students** — Department student overview with clearance status

### 🛡️ Admin Dashboard
- System-wide user management across all roles
- Department management
- Global configuration and monitoring

### 📄 COE (Controller of Examinations) Dashboard
- Hall ticket template management (legacy & visual builder modes)
- Exam timetable configuration
- Subject management across semesters

---

## Key Features

| Feature | Description |
|---------|-------------|
| 🔐 **Role-Based Access** | 7 roles with Supabase RLS enforcing permissions at the database level |
| ⚡ **Real-Time Updates** | Supabase Realtime subscriptions for live dashboard updates |
| 🔄 **Automated Pipeline** | PostgreSQL triggers auto-advance clearance stages |
| 📊 **CSV Import/Export** | Bulk operations for attendance, dues, and student data |
| 🎫 **PDF Hall Tickets** | Auto-generated PDFs with custom template support |
| 🌙 **Dark Mode** | System-aware theme with persistent user preference |
| 📱 **Responsive** | Mobile-friendly design across all dashboards |
| 🔔 **Notifications** | In-app notifications for clearance status changes |
| 🏗️ **Visual Template Builder** | Drag-and-drop hall ticket template designer (COE) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + TypeScript 5.9 |
| **Styling** | TailwindCSS 3.4 |
| **Build Tool** | Vite 8 |
| **Backend/Database** | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| **PDF Generation** | jsPDF |
| **Icons** | Lucide React |
| **Routing** | React Router v7 |
| **Deployment** | Vercel |

---

## Project Structure

```
NOC-Portal/
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── StudentDashboard.tsx     # Student clearance view
│   │   │   ├── FacultyDashboard.tsx     # Attendance & IA management
│   │   │   ├── StaffDashboard.tsx       # Staff operations & user mgmt
│   │   │   ├── AccountsDashboard.tsx    # Fee verification & dues
│   │   │   ├── HodDashboard.tsx         # Final approvals & dept mgmt
│   │   │   ├── AdminDashboard.tsx       # System administration
│   │   │   └── CoeDashboard.tsx         # Hall ticket templates & exams
│   │   ├── layout/                      # App layout & navigation
│   │   ├── ThemeProvider.tsx            # Dark/light mode support
│   │   └── ThemeToggle.tsx              # Theme switcher component
│   ├── lib/
│   │   ├── api.ts                       # Core API functions (Supabase queries)
│   │   ├── supabase.ts                  # Supabase client initialization
│   │   ├── useAuth.ts                   # Auth hook with profile management
│   │   └── errorHandler.ts             # Friendly error messages
│   ├── pages/
│   │   ├── Login.tsx                    # Authentication page
│   │   ├── UpdatePassword.tsx           # Password reset flow
│   │   └── DashboardRouter.tsx          # Role-based dashboard routing
│   ├── types/
│   │   └── database.types.ts            # TypeScript interfaces for DB schema
│   ├── App.tsx                          # Root component with routing
│   └── main.tsx                         # Application entry point
├── supabase/
│   └── migrations/                      # 28 sequential SQL migrations
│       ├── 0001_initial_schema.sql
│       ├── ...
│       └── 0028_attendance_fee_pipeline.sql
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Supabase** project ([supabase.com](https://supabase.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/visheshdevanur/NOC-Portal.git
cd NOC-Portal

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

---

## Database Migrations

Run the migrations **in order** (0001 → 0028) in the Supabase SQL Editor:

```bash
# Migrations are in:
supabase/migrations/
```

> **Note:** Migration `0028` requires running the `ALTER TYPE` statement separately first due to PostgreSQL enum constraints:
> ```sql
> ALTER TYPE clearance_stage ADD VALUE IF NOT EXISTS 'accounts_review' AFTER 'faculty_review';
> ```
> Then run the rest of the migration.

---

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

You can find these values in your Supabase project dashboard under **Settings → API**.

---

## Deployment

The project is configured for **Vercel** deployment:

1. Connect your GitHub repository to Vercel
2. Set the environment variables in Vercel project settings
3. Deploy — Vercel will automatically build on every push to `main`

### Build Command
```bash
npm run build    # tsc -b && vite build
```

---

## License

This project is private and maintained by [@visheshdevanur](https://github.com/visheshdevanur).
