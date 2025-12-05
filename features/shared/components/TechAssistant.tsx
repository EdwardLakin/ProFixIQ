"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function TechAssistant({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [noteForPhoto, setNoteForPhoto] = useState("");

  const {
    vehicle,
    setVehicle,
    context,
    setContext,
    messages,
    sending,
    partial,
    error,
    sendChat,
    sendPhoto,
    exportToWorkOrder,
    resetConversation,
    cancel,
  } = useTechAssistant({ defaultVehicle });

  // Seed default vehicle once (without clobbering restored vehicle)
  useEffect(() => {
    if (
      defaultVehicle &&
      (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))
    ) {
      setVehicle(defaultVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  // Auto-scroll to latest inside the conversation area
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, partial, sending]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    const v = vehicle ?? {};
    const lines: string[] = [];

    const vehicleLine = `Vehicle: ${[v.year, v.make, v.model]
      .filter(Boolean)
      .join(" ")}`.trim();
    if (vehicleLine !== "Vehicle:") lines.push(vehicleLine);

    if (context.trim()) {
      lines.push(`Shop notes / complaint: ${context.trim()}`);
    }

    lines.push(`Question: ${text}`);
    const payload = lines.join("\n\n");

    sendChat(payload);

    if (inputRef.current) inputRef.current.value = "";
  };

  const inputBase =
    "w-full rounded-md bg-black/70 border border-[var(--metal-border-soft)] text-white " +
    "placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]";

  return (
    <div className="space-y-5 text-sm text-white">
      {/* CARD: Vehicle + Notes + Attach */}
      <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/65 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Vehicle &amp; Context
        </div>

        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Vehicle
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className={`${inputBase} py-2`}
              placeholder="Year"
              value={vehicle?.year ?? ""}
              onChange={(e) =>
                setVehicle({
                  ...(vehicle ?? { make: "", model: "" }),
                  year: e.target.value,
                })
              }
            />
            <input
              className={`${inputBase} py-2`}
              placeholder="Make"
              value={vehicle?.make ?? ""}
              onChange={(e) =>
                setVehicle({
                  ...(vehicle ?? { year: "", model: "" }),
                  make: e.target.value,
                })
              }
            />
            <input
              className={`${inputBase} py-2`}
              placeholder="Model"
              value={vehicle?.model ?? ""}
              onChange={(e) =>
                setVehicle({
                  ...(vehicle ?? { year: "", make: "" }),
                  model: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Notes
          </div>
          <textarea
            className={`${inputBase} h-20`}
            placeholder="Shop notes / context (symptoms, readings, conditions, DTCs)."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
            Attach
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-white/5 disabled:opacity-60">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void sendPhoto(f, noteForPhoto).finally(() => {
                    if (fileRef.current) fileRef.current.value = "";
                    setNoteForPhoto("");
                  });
                }}
                disabled={sending}
              />
              Attach Photo
            </label>
            <input
              className={`${inputBase} min-w-44 flex-1 py-1.5 text-xs`}
              placeholder="Optional note for this photo"
              value={noteForPhoto}
              onChange={(e) => setNoteForPhoto(e.target.value)}
              disabled={sending}
            />
            <button
              className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-white/5 disabled:opacity-60"
              onClick={resetConversation}
              type="button"
              disabled={sending}
            >
              Reset
            </button>
            <button
              className="rounded-full border border-red-600/80 bg-red-900/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-900/60 disabled:opacity-60"
              onClick={cancel}
              type="button"
              disabled={!sending}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* CARD: Conversation */}
      <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/70 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
        {/* Scrollable messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-[140px] max-h-[50vh] overflow-y-auto p-4 space-y-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {messages.map((m, i) => {
            const mine = m.role === "user";
            const bubble =
              "max-w-[95%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words";
            return mine ? (
              <div key={i} className="flex justify-end">
                <div
                  className={`${bubble} bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black font-semibold`}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className={`${bubble} bg-neutral-950/90 text-neutral-200`}>
                  <div className="prose prose-invert prose-sm !text-neutral-200">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        li: ({ children }) => (
                          <li className="my-0.5">{children}</li>
                        ),
                        ul: ({ children }) => (
                          <ul className="my-1 list-disc pl-5">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-1 list-decimal pl-5">
                            {children}
                          </ol>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mt-2 mb-1 text-sm font-semibold text-white">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => <p className="my-1">{children}</p>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">
                            {children}
                          </strong>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}

          {(sending || partial.length > 0) && (
            <div className="flex justify-start">
              <div className="max-w-[95%] rounded-xl bg-neutral-950/90 px-3 py-2 text-sm text-neutral-300 opacity-90">
                {partial.length > 0 ? partial : "Assistant is thinking…"}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={onSubmit}
          className="flex gap-2 border-t border-[var(--metal-border-soft)] bg-black/70 p-3"
        >
          <input
            ref={inputRef}
            className={`${inputBase} flex-1 py-2.5 text-sm`}
            placeholder={
              canSend ? "Ask the assistant…" : "Enter year, make, model first"
            }
            disabled={sending}
          />
          <button
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(212,118,49,0.7)] hover:brightness-110 disabled:opacity-60"
            disabled={sending || !canSend}
            type="submit"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>

      {/* Export to Work Order (optional) */}
      {workOrderLineId && (
        <div className="pt-1">
          <button
            className="rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_18px_rgba(147,51,234,0.7)] hover:bg-purple-500 disabled:opacity-60"
            disabled={sending}
            onClick={async () => {
              try {
                const res = await exportToWorkOrder(workOrderLineId);
                alert(
                  `Exported:\nCause: ${res.cause}\nCorrection: ${
                    res.correction
                  }\nLabor: ${res.estimatedLaborTime ?? "—"}h`,
                );
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            Summarize &amp; Export to Work Order
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-600 bg-red-950/60 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}