// features/shared/components/TechAssistant.tsx
"use client";

import { FormEvent, useEffect, useRef, } from "react";
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
  const chatInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // hook
  const {
    vehicle, setVehicle,
    context, setContext,
    messages, setMessages,
    sending, partial,
    sendChat, sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  // --------------------
  // Restore saved state (vehicle, context, messages) on mount
  // and seed default vehicle only if nothing saved.
  // --------------------
  useEffect(() => {
    try {
      const savedVehicle = localStorage.getItem("assistant:vehicle");
      if (savedVehicle) {
        setVehicle(JSON.parse(savedVehicle));
      } else if (defaultVehicle) {
        setVehicle(defaultVehicle);
      }
    } catch {}

    const savedContext = localStorage.getItem("assistant:context");
    if (savedContext) setContext(savedContext);

    try {
      const savedMsgs = localStorage.getItem("assistant:messages");
      if (savedMsgs) setMessages(JSON.parse(savedMsgs));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  // Save vehicle & messages immediately when they change
  useEffect(() => {
    try {
      localStorage.setItem("assistant:vehicle", JSON.stringify(vehicle ?? {}));
    } catch {}
  }, [vehicle]);

  useEffect(() => {
    try {
      localStorage.setItem("assistant:messages", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Debounced auto-save for context (less chatty)
  useDebouncedAutoSave(context, 800, (draft) => {
    localStorage.setItem("assistant:context", draft);
  });

  // Auto-scroll conversation when new content arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, partial, sending]);

  // handlers
  const onSubmitChat = (e: FormEvent) => {
    e.preventDefault();
    const text = chatInputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (chatInputRef.current) chatInputRef.current.value = "";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm text-white">
      {/* LEFT: Vehicle + Context + Actions */}
      <div className="space-y-4">
        {/* Vehicle */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            aria-label="Vehicle year"
            placeholder="Year"
            value={vehicle?.year ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
            }
          />
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            aria-label="Vehicle make"
            placeholder="Make"
            value={vehicle?.make ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", model: "" }), make: e.target.value })
            }
          />
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            aria-label="Vehicle model"
            placeholder="Model"
            value={vehicle?.model ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", make: "" }), model: e.target.value })
            }
          />
        </div>

        {/* Context (Notes) */}
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Notes / Context</label>
          <textarea
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
            rows={6}
            placeholder="Symptoms, conditions, readings, what’s already been tested…"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        {/* Actions */}
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
                void sendPhoto(f).finally(() => {
                  if (fileRef.current) fileRef.current.value = "";
                });
              }}
              disabled={sending}
            />
            Attach Photo
          </label>

          <button
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            type="button"
            disabled={sending}
            title="Clear conversation"
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

          {workOrderLineId && (
            <button
              className="ml-auto rounded bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
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
          )}
        </div>
      </div>

      {/* RIGHT: Conversation + bottom input bar */}
      <div className="flex h-[640px] flex-col rounded border border-neutral-800 bg-neutral-900">
        {/* Scrollable conversation */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-3"
        >
          {messages.map((m, i) => {
            const mine = m.role === "user";
            const bubbleBase =
              "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap break-words";
            if (mine) {
              return (
                <div key={i} className="flex justify-end">
                  <div className={`${bubbleBase} bg-orange-600 text-black`}>{m.content}</div>
                </div>
              );
            }
            return (
              <div key={i} className="flex justify-start">
                <div className={`${bubbleBase} bg-neutral-700 text-neutral-100`}>
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
              Enter vehicle details and context, then ask a question or attach a photo.
            </div>
          )}
        </div>

        {/* Bottom input bar */}
        <form onSubmit={onSubmitChat} className="border-t border-neutral-800 p-2">
          <div className="flex gap-2">
            <input
              ref={chatInputRef}
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
              placeholder="Ask the assistant…"
              disabled={sending}
              aria-label="Ask the assistant"
            />
            <button
              className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
              disabled={sending}
              type="submit"
              title="Send"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}