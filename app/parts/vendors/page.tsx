import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

const quickLinks = [
  { href: "/parts", label: "Parts Dashboard" },
  { href: "/parts/inventory", label: "Inventory" },
  { href: "/parts/po", label: "Purchase Orders" },
  { href: "/parts/receiving", label: "Receiving Inbox" },
];

export default function PartsVendorsPage(): JSX.Element {
  return (
    <div className="relative p-5 text-white fade-in md:p-6">
      <PageShell
        eyebrow="Parts · Vendor operations"
        title="Vendors & Integrations"
        description="Track supplier readiness while integration APIs are staged. Use current Parts workflows for requesting, ordering, and receiving."
        actions={
          <>
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className={ui.buttonSecondary}>
                {link.label}
              </Link>
            ))}
          </>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="desktop-panel-soft p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Vendor directory status</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Directory staged for activation readiness</h2>
            <p className="mt-2 text-sm text-neutral-300">
              Vendor contact data and mapping readiness are reviewed during onboarding/import staging.
              Live supplier activation is intentionally disabled in this surface.
            </p>
          </section>

          <section className="desktop-panel-soft p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Parts vendor links</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Use current Parts flow for execution</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link href="/parts/requests" className={ui.buttonSecondary}>Open Requests</Link>
              <Link href="/parts/po" className={ui.buttonSecondary}>Manage POs</Link>
              <Link href="/parts/receiving" className={ui.buttonSecondary}>Receiving Queue</Link>
              <Link href="/parts/receive" className={ui.buttonSecondary}>Scan to Receive</Link>
            </div>
          </section>

          <section className="desktop-panel-soft p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Integration readiness</p>
            <h2 className="mt-2 text-lg font-semibold text-white">No live vendor API connections yet</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              <li>Shop-scoped vendor credentials are not enabled on this route yet.</li>
              <li>Use Parts requests, purchase orders, and receiving to run daily operations.</li>
              <li>This page is an operational checkpoint for activation readiness, not an API setup form.</li>
            </ul>
          </section>

          <section className="desktop-panel-soft p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Next integrations</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Planned connector sequence</h2>
            <ul className="mt-2 space-y-2 text-sm text-neutral-300">
              <li><span className="font-medium text-neutral-100">PartsTech</span> · Vendor catalog lookup and quoting sync (planned).</li>
              <li><span className="font-medium text-neutral-100">QuickBooks</span> · Accounting/export alignment for purchasing flows (planned).</li>
              <li><span className="font-medium text-neutral-100">Supplier APIs</span> · Direct PO submission and receive reconciliation (future).</li>
            </ul>
          </section>
        </div>
      </PageShell>
    </div>
  );
}
