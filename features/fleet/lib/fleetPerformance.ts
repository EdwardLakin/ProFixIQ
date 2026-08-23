export const FLEET_PERFORMANCE_EVENT = "profixiq:fleet-performance";

export type FleetPerformanceDetail = {
  operation: string;
  serverMs: number | null;
  networkMs: number;
  renderMs: number | null;
  totalMs: number;
  measuredAt: string;
};

export function parseFleetServerTiming(value: string | null): number | null {
  const match = value?.match(/(?:^|,)\s*fleet-data;dur=([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const duration = Number(match[1]);
  return Number.isFinite(duration) ? duration : null;
}

function emitFleetPerformance(detail: FleetPerformanceDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FleetPerformanceDetail>(FLEET_PERFORMANCE_EVENT, {
      detail,
    }),
  );
}

export function recordFleetRequestTiming(
  operation: string,
  startedAt: number,
  response: Response,
): { responseReceivedAt: number; serverMs: number | null } {
  const responseReceivedAt = performance.now();
  const totalMs = Math.max(0, responseReceivedAt - startedAt);
  const serverMs = parseFleetServerTiming(
    response.headers.get("server-timing"),
  );
  const networkMs = Math.max(0, totalMs - (serverMs ?? 0));

  performance.measure(`profixiq:fleet:${operation}:request`, {
    start: startedAt,
    end: responseReceivedAt,
  });
  emitFleetPerformance({
    operation,
    serverMs,
    networkMs,
    renderMs: null,
    totalMs,
    measuredAt: new Date().toISOString(),
  });

  return { responseReceivedAt, serverMs };
}

export function recordFleetRenderTiming(
  operation: string,
  responseReceivedAt: number,
  serverMs: number | null,
): void {
  requestAnimationFrame(() => {
    const renderedAt = performance.now();
    const renderMs = Math.max(0, renderedAt - responseReceivedAt);
    performance.measure(`profixiq:fleet:${operation}:render`, {
      start: responseReceivedAt,
      end: renderedAt,
    });
    emitFleetPerformance({
      operation,
      serverMs,
      networkMs: 0,
      renderMs,
      totalMs: renderMs,
      measuredAt: new Date().toISOString(),
    });
  });
}
