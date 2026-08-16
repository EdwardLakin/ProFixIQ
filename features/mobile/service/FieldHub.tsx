"use client";

import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  PackagePlus,
  Plus,
  RadioTower,
  Truck,
  UserRound,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import MobileServiceShell from "./MobileServiceShell";

type FieldModule = {
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  status: "ready" | "next";
};

const FIELD_MODULES: FieldModule[] = [
  {
    title: "Appointments",
    description: "Accept, create and manage digital bookings.",
    href: "/mobile/appointments",
    icon: CalendarDays,
    status: "ready",
  },
  {
    title: "Work orders",
    description: "Build the repair, labor and job record.",
    href: "/mobile/work-orders",
    icon: BriefcaseBusiness,
    status: "ready",
  },
  {
    title: "Inspections",
    description: "Run forms, capture evidence and findings.",
    href: "/mobile/inspections",
    icon: ClipboardCheck,
    status: "ready",
  },
  {
    title: "Customer intake",
    description: "Find or create the customer as you book the call.",
    href: "/mobile/service/new",
    icon: UserRound,
    status: "ready",
  },
  {
    title: "Parts & truck stock",
    description: "Request, receive, allocate and consume parts.",
    href: "/mobile/parts",
    icon: Boxes,
    status: "ready",
  },
  {
    title: "Invoices & payment",
    description: "Finish the invoice and collect in the field.",
    href: "/mobile/work-orders?status=ready_to_invoice",
    icon: FileText,
    status: "ready",
  },
  {
    title: "Fleet connections",
    description: "Work with units, inspections and service requests.",
    href: "/mobile/fleet",
    icon: Truck,
    status: "ready",
  },
  {
    title: "Purchase orders",
    description: "Mobile-first PO authoring and receiving is the next build slice.",
    icon: PackagePlus,
    status: "next",
  },
];

function FieldModuleCard({ module }: { module: FieldModule }) {
  const Icon = module.icon;
  const content = (
    <>
      <span className="field-hub-module__icon">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="field-hub-module__title">{module.title}</span>
          {module.status === "next" ? (
            <span className="field-hub-module__badge">Next</span>
          ) : null}
        </span>
        <span className="field-hub-module__description">
          {module.description}
        </span>
      </span>
      {module.href ? (
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]"
        />
      ) : null}
    </>
  );

  if (!module.href) {
    return (
      <div className="field-hub-module" data-available="false">
        {content}
      </div>
    );
  }

  return (
    <Link className="field-hub-module" href={module.href}>
      {content}
    </Link>
  );
}

export default function FieldHub() {
  const [online, setOnline] = useState(true);
  const [dateLabel, setDateLabel] = useState("Today");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    setDateLabel(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <main className="field-hub">
      <section className="field-hub-hero">
        <div className="min-w-0">
          <div className="field-hub-hero__eyebrow">
            <RadioTower aria-hidden className="h-3.5 w-3.5" /> Field command
          </div>
          <h1 className="field-hub-hero__title">Run the day from here.</h1>
          <p className="field-hub-hero__subtitle">
            {dateLabel}. One workspace for the call, repair, customer and money.
          </p>
        </div>
        <div className="field-hub-hero__actions">
          <Link href="/mobile/service/new" className="field-hub-primary-action">
            <Plus aria-hidden className="h-5 w-5" /> New service call
          </Link>
          <Link
            href="/mobile/appointments"
            className="field-hub-secondary-action"
          >
            <CalendarDays aria-hidden className="h-4 w-4" /> Book appointment
          </Link>
        </div>
      </section>

      <section className="field-hub-signals" aria-label="Field workspace status">
        <div className="field-hub-signal">
          <span className="field-hub-signal__icon" data-tone="blue">
            {online ? (
              <Wifi aria-hidden className="h-4 w-4" />
            ) : (
              <WifiOff aria-hidden className="h-4 w-4" />
            )}
          </span>
          <span>
            <strong>{online ? "Online" : "Working offline"}</strong>
            <small>
              {online ? "Field data can refresh" : "Saved work remains available"}
            </small>
          </span>
        </div>
        <div className="field-hub-signal">
          <span className="field-hub-signal__icon" data-tone="green">
            <CheckCircle2 aria-hidden className="h-4 w-4" />
          </span>
          <span>
            <strong>Full closeout</strong>
            <small>Invoice, payment and receipt</small>
          </span>
        </div>
        <div className="field-hub-signal">
          <span className="field-hub-signal__icon" data-tone="amber">
            <Clock3 aria-hidden className="h-4 w-4" />
          </span>
          <span>
            <strong>All-day workspace</strong>
            <small>Phone, tablet or laptop</small>
          </span>
        </div>
      </section>

      <div className="field-hub-grid">
        <section className="field-hub-today" aria-labelledby="field-today-heading">
          <div className="field-hub-section-heading">
            <div>
              <div className="field-hub-section-heading__eyebrow">Today</div>
              <h2 id="field-today-heading">Your field work</h2>
            </div>
            <Link href="/mobile/work-orders" className="field-hub-text-link">
              All work orders <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          <MobileServiceShell embedded />
        </section>

        <aside className="field-hub-operations" aria-labelledby="field-operations-heading">
          <div className="field-hub-section-heading">
            <div>
              <div className="field-hub-section-heading__eyebrow">Operations</div>
              <h2 id="field-operations-heading">Run the business</h2>
            </div>
          </div>
          <div className="field-hub-module-grid">
            {FIELD_MODULES.map((module) => (
              <FieldModuleCard key={module.title} module={module} />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
