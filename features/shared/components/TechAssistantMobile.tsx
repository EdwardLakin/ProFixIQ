// features/shared/components/TechAssistantMobile.tsx
"use client";

import { FormEvent, useMemo, useRef, useEffect } from "react";
import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDebouncedAutoSave } from "@/features/shared/hooks/useDebouncedAutoSave";

export default function TechAssistantMobile({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
}): JSX.Element {
  const {
    vehicle, setVehicle,
    context, setContext,
    messages, partial, sending, error,
    sendChat, sendPhoto,
    exportToWorkOrder, resetConversation,
  } = useTechAssistant({ defaultVehicle });

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

  // composer submit
  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = chatInputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (chatInputRef.current) chatInputRef.current.value = "";
  };

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

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col text-white md:hidden">
      {/* Header / vehicle fields */}
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
            if (mine) {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm bg-orange-600 text-black font-sans">
                    {m.content}
                  </div>
                </div>
              );
            }
            // Assistant → Markdown with black bubble & softer white text
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm bg-black text-neutral-200">
                  <div className="prose prose-invert prose-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children }) => (
                          <h2 className="text-base font-header tracking-wide mt-2 mb-1">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-header tracking-wide mt-2 mb-1">
                            {children}
                          </h3>
                        ),
                        li: ({ children }) => <li className="my-0.5">{children}</li>,
                        ul: ({ children }) => <ul className="list-disc pl-5 my-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 my-2">{children}</ol>,
                        p: ({ children }) => <p className="my-1">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}
          {!!partial && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded bg-black px-3 py-2 text-sm text-neutral-300 opacity-90">
                <div className="prose prose-invert prose-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {partial}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
          {messages.length === 0 && !partial && (
            <div className="text-xs text-neutral-400 font-header">
              Enter year, make, model, add context, then ask a question or attach a photo.
            </div>
          )}
        </div>
        {/* bottom spacer so last bubble isn’t hidden behind composer */}
        <div className="h-28" />
      </div>

      {/* Sticky composer (safe-area aware) */}
      <div className="sticky bottom-0 z-10 border-t border-neutral-800 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {/* Attach / Reset row */}
        <div className="flex items-center gap-2 px-3 pt-2">
          <label className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 cursor-pointer font-header">
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
            Attach Photo
          </label>

          <button
            type="button"
            className="rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60 font-header"
            onClick={resetConversation}
            disabled={sending}
          >
            Reset
          </button>
        </div>

        {/* Chat row */}
        <form
          onSubmit={onChatSubmit}
          className="flex items-center gap-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom))]"
        >
          <input
            ref={chatInputRef}
            className={`${inputBase} flex-1 py-3`}
            placeholder={canSend ? "Ask the assistant…" : "Enter year, make, model first"}
            disabled={sending}
          />
          <button
            type="submit"
            className="rounded bg-orange-600 px-4 py-3 text-sm font-header text-black hover:bg-orange-700 disabled:opacity-60"
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
            className="w-full rounded bg-purple-600 px-3 py-3 text-sm font-header hover:bg-purple-700 disabled:opacity-60"
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