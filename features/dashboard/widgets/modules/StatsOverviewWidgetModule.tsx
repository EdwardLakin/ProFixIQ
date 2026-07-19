import type { DashboardRenderContext } from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--theme-card-border,var(--theme-border-soft)) 78%, transparent)",
        background:
          "color-mix(in srgb, var(--theme-card-bg,var(--theme-surface-page)) 84%, var(--theme-surface-page))",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
      >
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      <div
        className="mt-1 text-xs"
        style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
      >
        {hint}
      </div>
    </div>
  );
}

function isTechRole(role: string | null): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "tech" || r === "mechanic" || r === "technician";
}

function metricTone(kind: "appointments" | "workOrders" | "partsRequests"): string {
  if (kind === "appointments") return "text-[color:var(--brand-secondary)]";
  if (kind === "partsRequests") return "text-[color:var(--brand-accent)]";
  return "text-[color:var(--brand-primary)]";
}

function StatsOverviewWidget({ context }: { context: DashboardRenderContext }) {
  const tech = isTechRole(context.role);

  return (
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Appointments"
        value={context.counts.appointments}
        hint={tech ? "Not used for tech view" : "Open bookings in your shop"}
        tone={metricTone("appointments")}
      />
      <MetricCard
        label={tech ? "My active jobs" : "Work orders"}
        value={context.counts.workOrders}
        hint={tech ? "Assigned lines still in progress" : "Open work orders in your shop"}
        tone={metricTone("workOrders")}
      />
      <MetricCard
        label={tech ? "My parts requests" : "Parts requests"}
        value={context.counts.partsRequests}
        hint={tech ? "Requests tied to you" : "Open parts activity"}
        tone={metricTone("partsRequests")}
      />
      <MetricCard
        label="My role"
        value={(context.role ?? "Unknown").toUpperCase()}
        hint="Role-aware dashboard context"
        tone="text-[color:var(--theme-text-primary,var(--theme-text-inverse))]"
      />
    </div>
  );
}

export const statsOverviewWidgetModule: DashboardWidgetModule = {
  id: "stats_overview",
  title: "Stats Overview",
  description: "Top counts and operational context",
  roles: ["owner", "admin", "manager", "advisor", "parts", "mechanic", "tech", "technician"],
  defaultW: 8,
  defaultH: 3,
  minW: 4,
  minH: 3,
  render: (context) => <StatsOverviewWidget context={context} />,
};
