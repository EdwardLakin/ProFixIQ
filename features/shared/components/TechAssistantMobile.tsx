"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";

export default function TechAssistantMobile({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
}) {
  const {
    vehicle, setVehicle,
    context, setContext,
    messages, partial, sending, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder, resetConversation, 
  } = useTechAssistant({ defaultVehicle });

  // local UI
  const [dtc, setDtc] = useState("");

  // refs
  const chatInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // derived
  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );
  const inputBase =
    "w-full rounded bg-neutral-900 border border-neutral-700 text-white " +
    "placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500";

  // handlers
  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = chatInputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (chatInputRef.current) chatInputRef.current.value = "";
  };

  const dtcValid =
    /^([PBUC])\d{4}$/i.test(dtc.trim()) || /^P0\d{3}$/i.test(dtc.trim());

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col text-white md:hidden">
      {/* Header / vehicle fields (collapsible look) */}
      <div className="space-y-2 p-3 pb-0">
        <div className="text-base font-header text-orange-500">Tech Assistant</div>
        <div className="grid grid-cols-3 gap-2">
          <input
            className={`${inputBase} py-2`}
            placeholder="Year"
            value={vehicle?.year ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
            }
            inputMode="numeric"
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

        <textarea
          className={`${inputBase} h-20`}
          placeholder="Context/observations (symptoms, readings, conditions)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      {/* Conversation */}
      <div className="relative flex-1 overflow-y-auto p-3 pt-2">
        <div className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.role === "user";
            return (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm font-header ${
                  mine ? "ml-auto bg-orange-600 text-black" : "mr-auto bg-neutral-800 text-white"
                }`}
              >
                {m.content}
              </div>
            );
          })}
          {!!partial && (
            <div className="mr-auto max-w-[85%] rounded bg-neutral-800 px-3 py-2 text-sm text-white opacity-90 font-header">
              {partial}
            </div>
          )}
          {messages.length === 0 && !partial && (
            <div className="text-xs text-neutral-400 font-header">
              Start by entering the vehicle, then ask a question, paste a DTC, or send a photo.
            </div>
          )}
        </div>
        {/* bottom spacer so last bubble isn’t hidden behind composer */}
        <div className="h-28" />
      </div>

      {/* Sticky composer (safe-area aware) */}
      <div className="sticky bottom-0 z-10 border-t border-neutral-800 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {/* DTC / Photo / Reset row */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <input
            className={`${inputBase} w-28`}
            placeholder="DTC (P0131)"
            value={dtc}
            onChange={(e) => setDtc(e.target.value.toUpperCase())}
            disabled={sending}
          />
          <button
            type="button"
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            disabled={sending || !dtcValid}
            onClick={() => sendDtc(dtc.trim().toUpperCase())}
          >
            Analyze
          </button>

          <label className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  void sendPhoto(f).finally(() => {
                    if (photoRef.current) photoRef.current.value = "";
                  });
                }
              }}
              disabled={sending}
            />
            Photo
          </label>

          <button
            type="button"
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            disabled={sending}
          >
            Reset
          </button>
        </div>

        {/* Chat row */}
        <form onSubmit={onChatSubmit} className="flex items-center gap-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom))]">
          <input
            ref={chatInputRef}
            className={`${inputBase} flex-1 py-3`}
            placeholder={canSend ? "Ask the assistant…" : "Enter year, make, model first"}
            disabled={sending}
          />
          <button
            type="submit"
            className="rounded bg-orange-600 px-4 py-3 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
            disabled={sending || !canSend}
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>

      {/* Error toast-ish */}
      {error && (
        <div className="mx-3 my-2 rounded border border-red-600 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Optional: export button for mobile */}
      {workOrderLineId && (
        <div className="px-3 pb-3">
          <button
            className="w-full rounded bg-purple-600 px-3 py-3 text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
            disabled={sending}
            onClick={async () => {
              try {
                const res = await exportToWorkOrder(workOrderLineId);
                alert(
                  `Exported:\nCause: ${res.cause}\nCorrection: ${res.correction}\nLabor: ${
                    res.estimatedLaborTime ?? "—"
                  }h`,
                );
              } catch (e) {
                alert(e instanceof Error ? e.message : "Export failed");
              }
            }}
          >
            Summarize & Export
          </button>
        </div>
      )}
    </div>
  );
}