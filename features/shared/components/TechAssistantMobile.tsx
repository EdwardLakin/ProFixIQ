"use client";

import { FormEvent, useMemo, useRef } from "react";
import { useTechAssistant, type Vehicle } from "@/features/ai/hooks/useTechAssistant";
import { useTabScopedStorageKey } from "@/features/shared/hooks/useTabScopedStorageKey";

export default function TechAssistantMobile({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
}) {
  const storageKey = useTabScopedStorageKey("assistant:state");

  const {
    vehicle, setVehicle,
    context, setContext,
    messages, partial, sending, error,
    sendChat, sendPhoto,
    exportToWorkOrder, resetConversation,
  } = useTechAssistant({ defaultVehicle, storageKey });

  const chatInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  const inputBase =
    "w-full rounded bg-neutral-900 border border-neutral-700 text-white " +
    "placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500";

  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = chatInputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (chatInputRef.current) chatInputRef.current.value = "";
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col text-white md:hidden">
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

      <div className="relative flex-1 overflow-y-auto p-3 pt-2">
        <div className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.role === "user";
            return (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm font-header ${
                  mine ? "ml-auto bg-orange-600 text-black" : "mr-auto bg-black text-neutral-200"
                }`}
              >
                {m.content}
              </div>
            );
          })}
          {!!partial && (
            <div className="mr-auto max-w-[85%] rounded bg-black px-3 py-2 text-sm text-neutral-200 opacity-90 font-header">
              {partial}
            </div>
          )}
          {messages.length === 0 && !partial && (
            <div className="text-xs text-neutral-400 font-header">
              Enter vehicle info, then ask a question or attach a photo.
            </div>
          )}
        </div>
        <div className="h-28" />
      </div>

      <div className="sticky bottom-0 z-10 border-t border-neutral-800 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-2 px-3 pt-2">
          <label className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void sendPhoto(f).finally(() => {
                  if (photoRef.current) photoRef.current.value = "";
                });
              }}
              disabled={sending}
            />
            Attach Photo
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

      {error && (
        <div className="mx-3 my-2 rounded border border-red-600 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

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
                const msg = e instanceof Error ? e.message : "Export failed";
                alert(msg);
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