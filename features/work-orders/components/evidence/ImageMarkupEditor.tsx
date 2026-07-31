"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Circle,
  PenLine,
  Redo2,
  Save,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import EvidenceOverlay from "./EvidenceOverlay";
import {
  EVIDENCE_COLORS,
  type EvidenceAnnotationElement,
  type EvidenceVisibility,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

type Tool = "path" | "circle" | "arrow" | "text";
type Point = { x: number; y: number };

function id(): string {
  return crypto.randomUUID();
}

export default function ImageMarkupEditor({
  item,
  onSaved,
  onClose,
}: {
  item: WorkOrderEvidenceItem;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const [tool, setTool] = useState<Tool>("path");
  const [color, setColor] = useState<string>(EVIDENCE_COLORS[0]);
  const [visibility, setVisibility] = useState<EvidenceVisibility>(
    item.annotation?.visibility ?? item.visibility,
  );
  const [elements, setElements] = useState<EvidenceAnnotationElement[]>(
    item.annotation?.overlay ?? [],
  );
  const [past, setPast] = useState<EvidenceAnnotationElement[][]>([]);
  const [future, setFuture] = useState<EvidenceAnnotationElement[][]>([]);
  const [draft, setDraft] = useState<EvidenceAnnotationElement | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleElements = useMemo(
    () => (draft ? [...elements, draft] : elements),
    [draft, elements],
  );

  const point = (event: PointerEvent<HTMLDivElement>): Point | null => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const commit = (next: EvidenceAnnotationElement[]) => {
    setPast((current) => [...current.slice(-29), elements]);
    setElements(next);
    setFuture([]);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const start = point(event);
    if (!start) return;
    dragStartRef.current = start;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "text") {
      const text = window.prompt("Short label (80 characters maximum)")?.trim();
      if (!text) return;
      commit([
        ...elements,
        {
          id: id(),
          type: "text",
          color,
          x: start.x,
          y: start.y,
          text: text.slice(0, 80),
        },
      ]);
      return;
    }

    if (tool === "path") {
      setDraft({
        id: id(),
        type: "path",
        color,
        strokeWidth: 4,
        points: [start, start],
      });
      return;
    }
    if (tool === "circle") {
      setDraft({
        id: id(),
        type: "circle",
        color,
        strokeWidth: 4,
        x: start.x,
        y: start.y,
        width: 0,
        height: 0,
      });
      return;
    }
    setDraft({
      id: id(),
      type: "arrow",
      color,
      strokeWidth: 4,
      start,
      end: start,
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = point(event);
    if (!current || !draft) return;

    if (draft.type === "path") {
      setDraft({ ...draft, points: [...draft.points, current].slice(-500) });
      return;
    }
    if (draft.type === "circle") {
      const start = dragStartRef.current;
      if (!start) return;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      setDraft({
        ...draft,
        x,
        y,
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      });
      return;
    }
    if (draft.type === "arrow") {
      setDraft({ ...draft, end: current });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commit([...elements, draft]);
    setDraft(null);
    dragStartRef.current = null;
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((current) => [elements, ...current].slice(0, 30));
    setElements(previous);
    setPast((current) => current.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((current) => [...current, elements].slice(-30));
    setElements(next);
    setFuture((current) => current.slice(1));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/work-orders/${item.workOrderId}/media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_annotation",
          mediaId: item.id,
          overlay: elements,
          visibility,
          clientMutationId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to save markup");
      }
      toast.success("Markup saved");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save markup");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const tools: Array<{ value: Tool; label: string; icon: typeof PenLine }> = [
    { value: "path", label: "Draw", icon: PenLine },
    { value: "circle", label: "Circle", icon: Circle },
    { value: "arrow", label: "Arrow", icon: ArrowUpRight },
    { value: "text", label: "Text", icon: Type },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark up evidence"
      className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black/95 p-2 sm:p-4 lg:p-6"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]">
        <header className="max-h-[35dvh] shrink-0 overflow-y-auto border-b border-[color:var(--theme-border-soft)] p-3">
          <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Mark up evidence
            </div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              The original image remains unchanged.
            </div>
          </div>
          {tools.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs ${
                tool === value
                  ? "border-[var(--brand-primary,#C1663B)] bg-[var(--brand-primary,#C1663B)]/15"
                  : "border-[color:var(--theme-border-soft)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] p-1">
            {EVIDENCE_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`Use ${value}`}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
                className={`h-6 w-6 rounded-full border-2 ${color === value ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
          <button type="button" onClick={undo} disabled={!past.length} className="rounded-lg border border-[color:var(--theme-border-soft)] p-2 disabled:opacity-40" aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={redo} disabled={!future.length} className="rounded-lg border border-[color:var(--theme-border-soft)] p-2 disabled:opacity-40" aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-black p-2 [-webkit-overflow-scrolling:touch] sm:p-4">
          <div className="flex min-h-full min-w-full items-center justify-center">
          <div
            ref={surfaceRef}
            className="relative inline-flex max-h-full max-w-full touch-none select-none overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              setDraft(null);
              dragStartRef.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.displayUrl ?? ""}
              alt={item.fileName ?? "Evidence to mark up"}
              className="block h-auto max-h-[calc(100dvh-13rem)] w-auto max-w-full object-contain"
              draggable={false}
            />
            <EvidenceOverlay elements={visibleElements} interactive />
          </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[color:var(--theme-border-soft)] p-3">
          <label className="mr-auto flex items-center gap-2 text-xs">
            Markup visibility
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as EvidenceVisibility)}
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1.5"
            >
              <option value="internal">Internal only</option>
              <option value="customer">Customer visible</option>
            </select>
          </label>
          <button type="button" onClick={onClose} className="rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary,#C1663B)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save markup"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
