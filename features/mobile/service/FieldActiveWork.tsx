import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  ClipboardCheck,
  Plus,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import MobileWorkOrderQueue from "@/features/mobile/work-orders/MobileWorkOrderQueue";
import MobileServiceShell from "./MobileServiceShell";

const FIELD_JOB_ACTIONS = [
  {
    label: "New service call",
    href: "/mobile/service/new",
    icon: Plus,
  },
  {
    label: "Truck parts",
    href: "/mobile/service/truck-inventory",
    icon: Boxes,
  },
  {
    label: "Inspections",
    href: "/mobile/inspections",
    icon: ClipboardCheck,
  },
  {
    label: "All work orders",
    href: "/mobile/work-orders",
    icon: BriefcaseBusiness,
  },
] as const;

export default function FieldActiveWork() {
  return (
    <main className="field-active-work">
      <section className="field-active-work__hero">
        <div>
          <div className="field-active-work__eyebrow">
            <Wrench aria-hidden className="h-3.5 w-3.5" /> Field execution
          </div>
          <h1>Active field work</h1>
          <p>
            Move the service call, repair record, inspection, parts and closeout
            forward from one Field workspace.
          </p>
        </div>
        <Link
          href="/mobile/work-orders"
          className="field-active-work__all-link"
        >
          All work <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </section>

      <nav
        className="field-active-work__actions"
        aria-label="Active work actions"
      >
        {FIELD_JOB_ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <Icon aria-hidden className="h-4.5 w-4.5" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <section
        className="field-active-work__section"
        aria-labelledby="field-call-heading"
      >
        <div className="field-active-work__heading">
          <div>
            <div className="field-active-work__eyebrow">Service call</div>
            <h2 id="field-call-heading">Your active and next stop</h2>
          </div>
          <span>Offline-safe status updates</span>
        </div>
        <MobileServiceShell embedded />
      </section>

      <section
        className="field-active-work__section"
        aria-labelledby="field-repairs-heading"
      >
        <div className="field-active-work__heading">
          <div>
            <div className="field-active-work__eyebrow">Repair flow</div>
            <h2 id="field-repairs-heading">Jobs in progress</h2>
          </div>
          <span>Canonical work-order records</span>
        </div>
        <MobileWorkOrderQueue initialStatus="in_progress" embedded lockStatus />
      </section>
    </main>
  );
}
