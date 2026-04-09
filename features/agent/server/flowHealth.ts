export const FLOW_HEALTH_THRESHOLDS = {
  approvalWaitHours: 12,
  queuedWaitHours: 24,
  onHoldWaitHours: 24,
  partsWaitHours: 48,
  unsentInvoiceHours: 48,
  unusuallyLongActiveJobHours: 10,
} as const;

export function ageHours(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / (1000 * 60 * 60);
}

export function isWorkOrderFlowStalled(status: string | null | undefined, hours: number): boolean {
  if (!status) return false;
  if (status === "awaiting_approval") return hours >= FLOW_HEALTH_THRESHOLDS.approvalWaitHours;
  if (status === "on_hold") return hours >= FLOW_HEALTH_THRESHOLDS.onHoldWaitHours;
  if (status === "queued") return hours >= FLOW_HEALTH_THRESHOLDS.queuedWaitHours;
  return hours >= FLOW_HEALTH_THRESHOLDS.queuedWaitHours;
}
