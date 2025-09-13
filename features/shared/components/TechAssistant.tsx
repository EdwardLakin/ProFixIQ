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
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dtc, setDtc] = useState("");
  const [note, setNote] = useState("");

  const {
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial,
    sendChat, sendDtc, sendPhoto,
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

  // ---- Debounced auto-save of context to localStorage ----
  useDebouncedAutoSave(context, 800, (draft) => {
    localStorage.setItem("assistant:context", draft);
  });

  // Restore saved context on mount
  useEffect(() => {
    const saved = localStorage.getItem("assistant:context");
    if (saved) setContext(saved);
  }, [setContext]);
  // --------------------------------------------------------

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (inputRef.current) inputRef.current.value = "";
  };

  const dtcValid =
    /^([PBUC])\d{4}$/i.test(dtc.trim()) || /^P0\d{3}$/i.test(dtc.trim());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-white">
      {/* LEFT */}
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

        {/* Context */}
        <textarea
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          rows={3}
          placeholder="Context/observations (readings, symptoms, conditions)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        {/* Input row */}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Ask the assistant…"
            disabled={sending}
          />
          <button
            className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
            disabled={sending}
            type="submit"
          >
            {sending ? "…" : "Send"}
          </button>
        </form>

        {/* DTC / Photo / Reset / Cancel */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-28 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="DTC (e.g. P0131)"
            value={dtc}
            onChange={(e) => setDtc(e.target.value.toUpperCase())}
            disabled={sending}
          />
          <input
            className="min-w-48 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            placeholder="Optional notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sending}
          />
          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            disabled={sending || !dtcValid}
            onClick={() => sendDtc(dtc.trim().toUpperCase(), note)}
            type="button"
            title={!dtcValid ? "Enter a valid DTC (e.g. P0131)" : "Analyze DTC"}
          >
            Analyze DTC
          </button>

          <label className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 cursor-pointer disabled:opacity-60">
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
            Send Photo
          </label>

          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            type="button"
            disabled={sending}
            title="Reset conversation"
          >
            Reset
          </button>
          <button
            className="rounded bg-red-600/80 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60"
            onClick={cancel}
            type="button"
            disabled={!sending}
            title="Cancel current request"
          >
            Cancel
          </button>
        </div>

        {!dtcValid && dtc.length > 0 && (
          <div className="text-xs text-red-400 -mt-1">Enter a valid OBD-II code (e.g. P0131).</div>
        )}

        {workOrderLineId && (
          <div className="pt-2">
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
                } catch (e: any) {
                  alert(e?.message ?? "Export failed");
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
            Enter vehicle details, then ask a question, paste a DTC, or send a photo.
          </div>
        )}
      </div>
    </div>
  );
}