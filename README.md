Here is a single self-contained card you can paste directly into your ProFixIQ repo README.
It summarizes the entire architecture, structure, conventions, and systems of the platform – desktop + mobile companion + AI + Agent service.

⸻

🧰 ProFixIQ – Developer Overview Card

(Paste this block into your README)

⸻

🚀 ProFixIQ: Full System Overview

ProFixIQ is an AI-native automotive repair shop operating system built on Next.js (App Router) + TypeScript + Supabase with a parallel Mobile Companion App and an external ProFixIQ Agent integration service.

This document summarizes the full structure, conventions, and architecture of the codebase.

⸻

📦 Tech Stack
	•	Next.js App Router, React Server Components
	•	TypeScript (strict, no any)
	•	Supabase (Postgres + Auth + RLS)
	•	TailwindCSS + shared UI component library
	•	OpenAI for AI features (quotes, suggestions, summaries, diagnostics)
	•	External ProFixIQ Agent (Node + Express + GitHub App for automated PRs)

⸻

🏗️ Application Structure

1. Desktop App (Main OS)

Located in standard Next.js app/* routes.

Shell & Layout
	•	app/layout.tsx – global Providers and AppShell
	•	AppShell includes:
	•	RoleSidebar (owner/admin/manager/advisor/mechanic)
	•	Top navigation
	•	TabsBridge (input & scroll persistence)
	•	Global modals (AI chat, Agent requests)
	•	ShiftTracker popup
	•	TabsBridge
	•	Per-user, per-route persistence of inputs + scroll
	•	Uses localStorage/sessionStorage

Core Modules
	•	Work Orders
	•	Work order CRUD
	•	work_order_lines with punch-in/out, parts allocations, AI suggestions
	•	Inspections
	•	Grid-based form builder + sessions
	•	Parts
	•	Parts inventory + allocations
	•	Messages
	•	AI assistant threads, mechanic/manager messaging
	•	Planner
	•	Calendar-based workflow planning
	•	Reports
	•	Revenue, labor, expenses, profit, tech efficiency
	•	PDF export (jsPDF)
	•	AI narrative summaries

⸻

2. Mobile Companion App

Standalone app under /app/mobile/* with its own shell (not wrapped by AppShell).

Structure
	•	app/mobile/layout.tsx → MobileShell
	•	MobileShell → header + content + MobileBottomNav
	•	MobileBottomNav → Home / Jobs / Messages / Settings
	•	Role-aware hub
	•	MobileRoleHub.tsx renders shortcut tiles per role/scope
	•	Mobile dashboards
	•	MobileTechHome.tsx (tech bench view)
	•	Job list
	•	Efficiency stats
	•	Punch status
	•	Quick tools
	•	Owner/Admin “Shop Console”

Mobile Modules
	•	Jobs (Mobile Work Orders)
	•	/mobile/work-orders
	•	MobileFocusedJob.tsx → punch controls, parts, notes, AI
	•	Punch / Time Tracking
	•	Shared DB: tech_shifts, punch_events
	•	Job punch: JobPunchButton
	•	Shift punch: PunchInOutButton
	•	Reports (Owner/Admin)
	•	/mobile/reports
	•	Uses getShopStats
	•	AI summary only (no heavy charts, no PDF)
	•	Messages
	•	Mobile chat UI (simplified)

⸻

🗂️ Database Overview (Supabase)

Multi-Tenant Model
	•	Every shop is isolated by shop_id
	•	Profiles linked to Supabase auth user
	•	RLS enforced across all major tables

Key Tables
	•	profiles – role, shop, user identity
	•	shops – tenant root
	•	work_orders
	•	work_order_lines – labor, status, punch, AI fields
	•	work_order_part_allocations
	•	vehicles, customers
	•	inspections, inspection_sessions, inspection_items
	•	punch_events, tech_shifts
	•	invoices, expenses
	•	messages (AI + user threads)

RLS
	•	Fully applied across:
	•	work orders / lines
	•	messages
	•	inspections
	•	profiles
	•	agent endpoints
	•	Uses shop_id matching + role permissions

⸻

⚙️ Time Tracking & Punch System
	•	Shift-based punching
	•	tech_shifts logs on/off/break/lunch
	•	Aggregated for daily/weekly hours worked
	•	Job punching
	•	JobPunchButton writes to work_order_lines
	•	Tracks punched_in_at, punched_out_at, labor_time
	•	Metrics (planned & partially implemented)
	•	Hours worked
	•	Hours billed
	•	Tech efficiency = billed ÷ worked
	•	Stats rendered on tech dashboard + reports

⸻

🧠 AI Integration

AI Quote Engine
	•	Located in features/integrations/ai
	•	Suggests:
	•	Parts
	•	Labor
	•	Estimated job totals
	•	Confidence score

Work Order AI
	•	Suggest additional jobs
	•	Summaries
	•	Cause/Correction help
	•	AIAssistantModal for full conversation

Reports AI
	•	/api/ai/summarize-stats
	•	Generates readable narratives from financial data

Image Diagnostics (planned)
	•	Photo uploads in work orders
	•	Vehicle inspection photo analysis

⸻

🤖 ProFixIQ Agent (External Microservice)

Standalone service used for repo automation.

Stack
	•	Node 20 + Express
	•	TypeScript
	•	Octokit GitHub App integration
	•	OpenAI LLM for code analysis

Capabilities
	•	Accept feature requests from the app
	•	Accept refactor requests
	•	Analyze codebase
	•	Open GitHub Pull Requests automatically
	•	Used for:
	•	RLS policy fixes
	•	Component refactors
	•	Inspection grid fixes
	•	File layout migrations

⸻

🎨 Design Language
	•	Dark neutral background (#0c0c0c family)
	•	Orange accent (#ff6b1a / #f97316)
	•	UI Components in @shared/components + features/shared/components
	•	Fonts:
	•	Black Ops One for headings
	•	Inter for body
	•	Cards with soft borders, minimal shadows
	•	Mobile has simplified “app-like” card layout
	•	Icons consistent with Lucide / HeroIcons

⸻

📁 Folder Structure (High-Level)

=============================================================

## Self-learning fitment dataset (backend only)

ProFixIQ maintains a backend-only “fitment evidence” dataset that grows automatically as the shop uses the system.

**Goal:** The system gets smarter over time by learning which parts are actually used on which vehicle configurations.

---

### Core tables

#### `public.vehicle_signatures`
- Per-shop vehicle signatures anchored by **(shop_id, vehicle_id)**.
- Stores normalized vehicle configuration captured from `vehicles`:
  - make, model, year
  - trim / submodel
  - engine, drivetrain, transmission, fuel_type
- Acts as the **source of truth** for vehicle_year / vehicle_trim used in fitment events.
- Can later be re-keyed to a full configuration hash if needed.

#### `public.part_fitment_events`
- Append-only log of real-world evidence:
  > “Part X was used on vehicle signature Y”
- Automatically populated by DB triggers.
- Enforces idempotency via **UNIQUE(allocation_id)**.
- Stores:
  - vehicle_year, vehicle_trim
  - snapshotted part metadata (brand, part_number, supplier)
  - confidence_source / confidence_score
  - event_type (allocation vs confirmed consumption)

---

### Automatic logging flow

When a `work_order_part_allocations` row is inserted:
1. Resolve work order + vehicle context (`shop_id`, `work_order_id`, `vehicle_id`)
2. Get or create the per-shop `vehicle_signature`
3. Insert a `part_fitment_event` with:
   - year / trim from the signature
   - default `confidence_source = 'manual'`
   - default `confidence_score = 1`
   - `event_type = 'allocated'`
   - `ON CONFLICT (allocation_id) DO NOTHING`

When a stock move is recorded with `stock_move_reason = 'consume'`:
- A **confirmed consumption** fitment event is recorded for the same part + vehicle signature.

---

### Derived data

#### `public.fitment_stats` (materialized view)
- Pre-aggregated stats per:
  - shop_id
  - vehicle_signature_id
  - part_id
- Includes:
  - allocation count
  - confirmed consumption count
  - first_seen_at / last_seen_at
- Used for fast fitment-aware queries and AI ranking.

---

### Future capabilities enabled

- Fitment-aware part suggestions
- Higher-accuracy AI quoting
- Shop-specific learned parts matching
- Confidence-weighted recommendations
- Optional global aggregation (opt-in, anonymized)

> No UI depends on this yet. This system is intentionally backend-only until enough data exists.