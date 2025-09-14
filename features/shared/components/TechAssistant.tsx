// features/shared/components/TechAssistant.tsx
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTechAssistant, type Vehicle } from "@/features/ai/hooks/useTechAssistant";
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
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial, error,
    sendChat, sendPhoto,
    exportToWorkOrder, resetConversation, cancel,
  } = useTechAssistant({ defaultVehicle });

  // Seed default vehicle once (without clobbering restored vehicle)
  useEffect(() => {
    if (defaultVehicle && (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))) {
      setVehicle(defaultVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  // Auto-scroll to latest
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partial, sending]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (inputRef.current) inputRef.current.value = "";
  };

  const inputBase =
    "w-full rounded bg-neutral-900 border border-neutral-700 text-white " +
    "placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500";

  return (
    <div className="space-y-6 text-white">
      <h1 className="font-header text-xl text-orange-400">Tech Assistant</h1>

      {/* CARD: Vehicle + Notes + Attach (stacked) */}
      <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur p-4">
        <div className="mb-2 text-xs font-header tracking-wide text-orange-400">Vehicle</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className={`${inputBase} py-2`}
            placeholder="Year"
            value={vehicle?.year ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
            }
          />
          <input
            className={`${inputBase} py-2`}
            placeholder="Make"
            value={vehicle?.make ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", model: "" }), make: e.target.value })
            }
          />
          <input
            className={`${inputBase} py-2`}
            placeholder="Model"
            value={vehicle?.model ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", make: "" }), model: e.target.value })
            }
          />
        </div>

        <div className="mt-4 mb-2 text-xs font-header tracking-wide text-orange-400">Notes</div>
        <textarea
          className={`${inputBase} h-28`}
          placeholder="Shop notes / context (symptoms, readings, conditions). The assistant will use this."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        <div className="mt-4 mb-2 text-xs font-header tracking-wide text-orange-400">Attach</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 cursor-pointer disabled:opacity-60">
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
            className={`${inputBase} min-w-48 flex-1`}
            placeholder="Optional note for this photo"
            value={noteForPhoto}
            onChange={(e) => setNoteForPhoto(e.target.value)}
            disabled={sending}
          />
          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            type="button"
            disabled={sending}
          >
            Reset
          </button>
          <button
            className="rounded bg-red-600/80 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60"
            onClick={cancel}
            type="button"
            disabled={!sending}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* CARD: Conversation (stacked below) */}
      <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur">
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-y-auto p-4 space-y-3"
        >
          {messages.map((m, i) => {
            const mine = m.role === "user";
            const bubble =
              "max-w-[95%] rounded px-3 py-2 text-sm whitespace-pre-wrap break-words";
            return mine ? (
              <div key={i} className="flex justify-end">
                <div className={`${bubble} bg-orange-600 text-black font-header`}>
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className={`${bubble} bg-neutral-900 text-neutral-200`}>
                  <div className="prose prose-invert prose-sm !text-neutral-200">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        li: ({ children }) => <li className="my-0.5">{children}</li>,
                        ul: ({ children }) => <ul className="list-disc pl-5 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 my-1">{children}</ol>,
                        h3: ({ children }) => <h3 className="text-sm font-header text-white mt-2 mb-1">{children}</h3>,
                        p:  ({ children }) => <p className="my-1">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
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
              <div className="max-w-[95%] rounded px-3 py-2 text-sm bg-neutral-900 text-neutral-300 opacity-90">
                {partial.length > 0 ? partial : "Assistant is thinking…"}
              </div>
            </div>
          )}

          {messages.length === 0 && !sending && partial.length === 0 && (
            <div className="text-xs text-neutral-400">
              Enter vehicle + notes, then ask a question or attach a photo.
            </div>
          )}
        </div>

        {/* Composer pinned to the bottom of the conversation card */}
        <form onSubmit={onSubmit} className="border-t border-white/10 p-3 flex gap-2">
          <input
            ref={inputRef}
            className={`${inputBase} flex-1 py-3`}
            placeholder={canSend ? "Ask the assistant…" : "Enter year, make, model first"}
            disabled={sending}
          />
          <button
            className="rounded bg-orange-600 px-4 py-3 text-sm font-header text-black hover:bg-orange-700 disabled:opacity-60"
            disabled={sending || !canSend}
            type="submit"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>

      {/* Export to Work Order (optional) */}
      {workOrderLineId && (
        <div>
          <button
            className="rounded bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
            disabled={sending}
            onClick={async () => {
              try {
                const res = await exportToWorkOrder(workOrderLineId);
                alert(
                  `Exported:\nCause: ${res.cause}\nCorrection: ${res.correction}\nLabor: ${
                    res.estimatedLaborTime ?? "—"
                  }h`,
                );
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            Summarize & Export to Work Order
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-600 bg-red-950/40 text-red-200 px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}