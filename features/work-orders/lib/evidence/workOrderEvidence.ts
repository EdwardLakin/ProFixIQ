export const EVIDENCE_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#38bdf8",
  "#ffffff",
] as const;

export type EvidenceVisibility = "internal" | "customer";

type EvidencePoint = {
  x: number;
  y: number;
};

export type EvidenceAnnotationElement =
  | {
      id: string;
      type: "path";
      color: string;
      strokeWidth: number;
      points: EvidencePoint[];
    }
  | {
      id: string;
      type: "circle";
      color: string;
      strokeWidth: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      id: string;
      type: "arrow";
      color: string;
      strokeWidth: number;
      start: EvidencePoint;
      end: EvidencePoint;
    }
  | {
      id: string;
      type: "text";
      color: string;
      x: number;
      y: number;
      text: string;
    };

export type WorkOrderEvidenceAnnotation = {
  id: string;
  version: number;
  visibility: EvidenceVisibility;
  createdAt: string;
  createdBy: string;
  overlay: EvidenceAnnotationElement[];
};

export type WorkOrderEvidenceItem = {
  id: string;
  workOrderId: string;
  workOrderLineId: string | null;
  quoteLineId: string | null;
  kind: string | null;
  source: string | null;
  visibility: EvidenceVisibility;
  fileName: string | null;
  contentType: string | null;
  fileSize: number | null;
  createdAt: string | null;
  displayUrl: string | null;
  annotation: WorkOrderEvidenceAnnotation | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNormalizedNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function validColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    EVIDENCE_COLORS.includes(value as (typeof EVIDENCE_COLORS)[number])
  );
}

function validStrokeWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 12
  );
}

function parsePoint(value: unknown): EvidencePoint | null {
  if (!isRecord(value)) return null;
  if (!isNormalizedNumber(value.x) || !isNormalizedNumber(value.y)) return null;
  return { x: value.x, y: value.y };
}

export function parseAnnotationOverlay(
  value: unknown,
): EvidenceAnnotationElement[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;

  const parsed: EvidenceAnnotationElement[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validId(item.id) || !validColor(item.color)) {
      return null;
    }

    if (item.type === "path") {
      if (!validStrokeWidth(item.strokeWidth) || !Array.isArray(item.points)) {
        return null;
      }
      if (item.points.length < 2 || item.points.length > 500) return null;
      const points = item.points.map(parsePoint);
      if (points.some((point) => point === null)) return null;
      parsed.push({
        id: item.id,
        type: "path",
        color: item.color,
        strokeWidth: item.strokeWidth,
        points: points as EvidencePoint[],
      });
      continue;
    }

    if (item.type === "circle") {
      if (
        !validStrokeWidth(item.strokeWidth) ||
        !isNormalizedNumber(item.x) ||
        !isNormalizedNumber(item.y) ||
        !isNormalizedNumber(item.width) ||
        !isNormalizedNumber(item.height)
      ) {
        return null;
      }
      parsed.push({
        id: item.id,
        type: "circle",
        color: item.color,
        strokeWidth: item.strokeWidth,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });
      continue;
    }

    if (item.type === "arrow") {
      const start = parsePoint(item.start);
      const end = parsePoint(item.end);
      if (!validStrokeWidth(item.strokeWidth) || !start || !end) return null;
      parsed.push({
        id: item.id,
        type: "arrow",
        color: item.color,
        strokeWidth: item.strokeWidth,
        start,
        end,
      });
      continue;
    }

    if (item.type === "text") {
      if (
        !isNormalizedNumber(item.x) ||
        !isNormalizedNumber(item.y) ||
        typeof item.text !== "string" ||
        item.text.trim().length === 0 ||
        item.text.length > 80
      ) {
        return null;
      }
      parsed.push({
        id: item.id,
        type: "text",
        color: item.color,
        x: item.x,
        y: item.y,
        text: item.text.trim(),
      });
      continue;
    }

    return null;
  }

  return parsed;
}

export function annotationPath(points: EvidencePoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x * 1000} ${point.y * 1000}`,
    )
    .join(" ");
}

export function isVideoEvidence(
  item: Pick<WorkOrderEvidenceItem, "kind" | "contentType" | "fileName">,
): boolean {
  return (
    item.kind === "video" ||
    item.contentType?.startsWith("video/") === true ||
    /\.(mov|m4v|mp4|webm)$/i.test(item.fileName ?? "")
  );
}

