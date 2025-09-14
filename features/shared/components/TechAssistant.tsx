// features/shared/components/TechAssistant.tsx
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useTechAssistant, type Vehicle } from "@/features/ai/hooks/useTechAssistant";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDebouncedAutoSave } from "@/features/shared/hooks/useDebouncedAutoSave";

export default function TechAssistant({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
}) {
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // local UI state
  const [note,] = useState("");

  // hook
  const {
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial, error,
    sendChat, /* sendDtc, */ sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  // Seed default vehicle once (but don't clobber a restored vehicle)
  useEffect(() => {
    if (defaultVehicle && (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))) {
      setVehicle(defaultVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  // Debounced auto-save of context to localStorage
  useDebouncedAutoSave(context, 800, (draft) => {
    localStorage.setItem("assistant:context", draft);
  });
  useEffect(() => {
    const saved = localStorage.getItem("assistant:context");
    if (saved) setContext(saved);
  }, [setContext]);

  // derived state
  const vehicleReady = Boolean(vehicle?.year && vehicle?.make && vehicle?.model);

  // handlers
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-white">
      {/* LEFT: Inputs & controls */}
      <div className="space-y-4">
        {/* Vehicle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Year"
            value={vehicle?.year ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
            }
          />
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Make"
            value={vehicle?.make ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", model: "" }), make: e.target.value })
            }
          />
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Model"
            value={vehicle?.model ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", make: "" }), model: e.target.value })
            }
          />
        </div>

        {/* Notes / Context */}
        <textarea
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          rows={4}
          placeholder="Notes / Context (readings, symptoms, conditions)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          aria-label="Notes / Context"
        />

        {/* Control buttons (even widths) */}
        <div className="grid grid-cols-3 gap-2">
          <label className="w-full text-center rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 cursor-pointer disabled:opacity-60">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void sendPhoto(f, note).finally(() => {
                  if (fileRef.current) fileRef.current.value = "";
                });
              }}
              disabled={sending}
            />
            Attach Photo
          </label>

          <button
            className="w-full rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            type="button"
            disabled={sending}
            title="Reset conversation"
          >
            Reset
          </button>

          <button
            className="w-full rounded bg-red-600/80 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60"
            onClick={cancel}
            type="button"
            disabled={!sending}
            title="Cancel current request"
          >
            Cancel
          </button>
        </div>

        {/* Error banner (e.g., missing vehicle info) */}
        {(!vehicleReady || error) && (
          <div className="rounded border border-yellow-600 bg-yellow-900/30 text-yellow-200 px-3 py-2">
            {!vehicleReady
              ? "Enter Year, Make, and Model before sending a question."
              : error}
          </div>
        )}

        {/* Ask the assistant (moved to bottom of left column) */}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Ask the assistant…"
            disabled={sending || !vehicleReady}
            aria-label="Ask the assistant"
          />
          <button
            className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
            disabled={sending || !vehicleReady}
            type="submit"
            title={vehicleReady ? "Send" : "Fill Year/Make/Model first"}
          >
            {sending ? "…" : "Send"}
          </button>
        </form>

        {/* Optional: Export to Work Order */}
        {workOrderLineId && (
          <div className="pt-1">
            <button
              className="rounded bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
              disabled={sending || !vehicleReady}
              onClick={async () => {
                try {
                  const res = await exportToWorkOrder(workOrderLineId);
                  alert(
                    `Exported:\nCause: ${res.cause}\nCorrection: ${res.correction}\nLabor: ${
                      res.estimatedLaborTime ?? "—"
                    }h`,
                  );
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Export failed";
                  alert(msg);
                }
              }}
            >
              Summarize & Export to Work Order
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Conversation */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 overflow-y-auto max-h-[560px] space-y-3">
        {messages.map((m, i) => {
          const mine = m.role === "user";
          const bubble =
            "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap break-words";
          return mine ? (
            <div key={i} className="flex justify-end">
              <div className={`${bubble} bg-orange-600 text-black`}>{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={`${bubble} bg-neutral-700 text-neutral-100`}>
                <div className="prose prose-invert prose-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {(sending || partial.length > 0) && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded px-3 py-2 text-sm bg-neutral-700 text-neutral-100 opacity-90">
              <div className="prose prose-invert prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {partial.length > 0 ? partial : "Assistant is typing…"}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {messages.length === 0 && !sending && partial.length === 0 && (
          <div className="text-xs text-neutral-400">
            Enter vehicle details, add context, then ask a question or attach a photo.
          </div>
        )}
      </div>
    </div>
  );
}