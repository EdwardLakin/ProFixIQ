import "server-only";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function groundingLine(record: Record<string, unknown>): string | null {
  const grounding = asRecord(record.grounding);
  const dataCurrentAsOf = stringValue(grounding.dataCurrentAsOf);
  const recordCount = numberValue(grounding.recordCount);
  if (!dataCurrentAsOf || recordCount == null) return null;
  return `Data current as of ${dataCurrentAsOf} • ${recordCount} record(s).`;
}

function formatListRows(
  rows: unknown,
  formatter: (row: Record<string, unknown>) => string | null,
  limit = 8,
): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => formatter(asRecord(row)))
    .filter((row): row is string => Boolean(row))
    .slice(0, limit);
}

export function formatShopAssistantToolOutput(
  toolName: string,
  output: unknown,
): string {
  const record = asRecord(output);
  const summary = stringValue(record.summary) ?? `${toolName} completed.`;
  let bullets: string[] = [];

  if (toolName === "list_low_stock_parts") {
    bullets = formatListRows(record.items, (item) => {
      const name = stringValue(item.name);
      const quantity = numberValue(item.quantityOnHand);
      const threshold = numberValue(item.threshold);
      const reorder = numberValue(item.suggestedReorder);
      return name && quantity != null && threshold != null && reorder != null
        ? `${name}: ${quantity} on hand, threshold ${threshold}, suggested reorder ${reorder}.`
        : null;
    });
  } else if (toolName === "list_parts_blockers") {
    bullets = formatListRows(record.blockers, (item) => {
      const description = stringValue(item.description);
      const remaining = numberValue(item.remainingQuantity);
      const label = stringValue(item.workOrderLabel);
      return description && remaining != null
        ? `${label ? `${label}: ` : ""}${description} — ${remaining} still unreceived.`
        : null;
    });
  } else if (toolName === "list_pending_approvals") {
    bullets = formatListRows(record.items, (item) => {
      const customId = stringValue(item.customId);
      const customerName = stringValue(item.customerName);
      const vehicleSummary = stringValue(item.vehicleSummary);
      const estimatedTotal = numberValue(item.estimatedTotal);
      return [
        customId ? `WO #${customId}` : "Work order",
        customerName,
        vehicleSummary,
        estimatedTotal == null ? null : `$${estimatedTotal.toFixed(2)} pending`,
      ]
        .filter(Boolean)
        .join(" • ");
    });
  } else if (toolName === "list_stalled_work_orders") {
    bullets = formatListRows(record.workOrders, (item) => {
      const customId = stringValue(item.customId);
      const status = stringValue(item.status);
      const age = numberValue(item.ageHours);
      const nextStep = stringValue(item.recommendedNextStep);
      return `${customId ? `WO #${customId}` : "Work order"} • ${status ?? "unknown"}${age == null ? "" : ` • ${age} hours`} ${nextStep ? `— ${nextStep}` : ""}`;
    });
  } else if (toolName === "list_ready_invoices") {
    bullets = formatListRows(record.workOrders, (item) => {
      const customId = stringValue(item.customId);
      const status = stringValue(item.status);
      const customerName = stringValue(item.customerName);
      return `${customId ? `WO #${customId}` : "Work order"} • ${status ?? "ready"}${customerName ? ` • ${customerName}` : ""}`;
    });
  } else if (toolName === "list_technician_load") {
    bullets = formatListRows(record.technicians, (item) => {
      const name = stringValue(item.name);
      const active = numberValue(item.activeJobs);
      const utilization = numberValue(item.utilizationPct);
      return name && active != null && utilization != null
        ? `${name}: ${active} active job(s), ${utilization}% utilization.`
        : null;
    });
  } else if (toolName === "list_technician_assignments") {
    bullets = formatListRows(record.workOrders, (item) => {
      const customId = stringValue(item.customId);
      const status = stringValue(item.status);
      const vehicle = stringValue(item.vehicle);
      const lineLabels = Array.isArray(item.lines)
        ? item.lines
            .map((line) => stringValue(asRecord(line).label))
            .filter((label): label is string => Boolean(label))
            .slice(0, 3)
        : [];
      return [
        customId ? `WO #${customId}` : "Assigned work order",
        status,
        vehicle,
        lineLabels.length ? lineLabels.join("; ") : null,
      ]
        .filter(Boolean)
        .join(" - ");
    });
  } else if (toolName === "list_my_assigned_work") {
    bullets = formatListRows(record.workOrders, (item) => {
      const customId = stringValue(item.customId);
      const vehicle = stringValue(item.vehicle);
      const lines = Array.isArray(item.lines) ? item.lines.length : 0;
      return `${customId ? `WO #${customId}` : "Assigned work order"}${vehicle ? ` • ${vehicle}` : ""} • ${lines} active job line(s)`;
    });
  } else if (toolName === "list_fleet_units") {
    bullets = formatListRows(record.units, (item) => {
      const label = stringValue(item.label);
      const fleet = stringValue(item.fleetName);
      const make = stringValue(item.make);
      const model = stringValue(item.model);
      return label
        ? `${label}${fleet ? ` • ${fleet}` : ""}${make || model ? ` • ${[make, model].filter(Boolean).join(" ")}` : ""}`
        : null;
    });
  } else if (toolName === "list_fleet_service_requests") {
    bullets = formatListRows(record.requests, (item) => {
      const title = stringValue(item.title);
      const status = stringValue(item.status);
      const severity = stringValue(item.severity);
      return title
        ? `${title}${status ? ` • ${status}` : ""}${severity ? ` • ${severity}` : ""}`
        : null;
    });
  } else if (toolName === "recommend_work_assignments") {
    bullets = formatListRows(record.recommendations, (item) => {
      const customId = stringValue(item.customId);
      const description = stringValue(item.primaryJob);
      const tech = stringValue(item.recommendedTechnicianName);
      const reason = stringValue(item.reason);
      return `${customId ? `WO #${customId}` : "Work order"}${description ? ` • ${description}` : ""}${tech ? ` → ${tech}` : ""}${reason ? ` — ${reason}` : ""}`;
    });
  } else if (toolName === "list_bookings") {
    bullets = formatListRows(record.bookings, (item) => {
      const startsAt = stringValue(item.startsAt);
      const status = stringValue(item.status);
      return startsAt ? `${startsAt} • ${status ?? "scheduled"}` : null;
    });
    const conflicts = Array.isArray(record.conflicts) ? record.conflicts.length : 0;
    if (conflicts > 0) bullets.push(`${conflicts} overlapping appointment pair(s) need review.`);
  } else if (toolName === "find_customers") {
    bullets = formatListRows(record.customers, (item) => {
      const name = stringValue(item.name);
      const email = stringValue(item.email);
      const phone = stringValue(item.phone);
      return name ? [name, email, phone].filter(Boolean).join(" • ") : null;
    });
  } else if (toolName === "list_inspections") {
    bullets = formatListRows(record.inspections, (item) => {
      const status = stringValue(item.status);
      const workOrderId = stringValue(item.workOrderId);
      return `${workOrderId ? `WO ${workOrderId.slice(0, 8)}` : "Inspection"} • ${status ?? "unknown"}${item.completed === true ? " • completed" : ""}`;
    });
  } else if (toolName === "read_shop_state") {
    bullets = formatListRows(
      record.alerts,
      (item) => {
        const title = stringValue(item.title);
        const message = stringValue(item.message);
        return title ? `${title}${message ? ` — ${message}` : ""}` : null;
      },
      5,
    );
  } else if (toolName === "read_daily_activity") {
    bullets = formatListRows(record.changes, (item) => {
      const at = stringValue(item.at);
      const label = stringValue(item.label);
      const detail = stringValue(item.detail);
      return label ? `${at ? `${at} • ` : ""}${label}${detail ? ` — ${detail}` : ""}` : null;
    });
  } else if (toolName === "read_work_order" || toolName === "read_invoice_status") {
    const href = stringValue(record.href);
    if (href) bullets.push(`Open record: ${href}`);
  } else if (Array.isArray(record.records)) {
    bullets = formatListRows(record.records, (item) => {
      const label = stringValue(item.label);
      const status = stringValue(item.status);
      const detail = stringValue(item.detail);
      return label
        ? `${label}${status ? ` • ${status}` : ""}${detail ? ` — ${detail}` : ""}`
        : null;
    });
  }

  const groundedAt = groundingLine(record);
  return [
    summary,
    ...bullets.map((bullet) => `• ${bullet}`),
    groundedAt,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function recordOutput(value: unknown): Record<string, unknown> {
  return asRecord(value);
}
