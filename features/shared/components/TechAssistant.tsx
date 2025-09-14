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
  const scrollRef = useRef<HTMLDivElement>(null);

  const [note,] = useState("");

  const {
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial,
    sendChat, sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  // Seed default vehicle once but don't overwrite restored
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

  // Auto-scroll to bottom on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partial, sending]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-white">
      {/* LEFT — Inputs */}
      <div className="space-y-4">
        <div className="font-header text-lg text-orange-400">Vehicle</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="input"
            placeholder="Year"
            value={vehicle?.year ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
            }
          />
          <input
            className="input"
            placeholder="Make"
            value={vehicle?.make ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", model: "" }), make: e.target.value })
            }
          />
            <input
            className="input"
            placeholder="Model"
            value={vehicle?.model ?? ""}
            onChange={(e) =>
              setVehicle({ ...(vehicle ?? { year: "", make: "" }), model: e.target.value })
            }
          />
        </div>

        <div className="font-header text-lg text-orange-400">Notes</div>
        <textarea
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          rows={4}
          placeholder="Observations, readings, symptoms, conditions…"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        <div className="font-header text-lg text-orange-400">Attach</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-header rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 cursor-pointer disabled:opacity-60">
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
            className="font-header rounded bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700 disabled:opacity-60"
            onClick={resetConversation}
            type="button"
            disabled={sending}
            title="Reset conversation"
          >
            Reset
          </button>
          <button
            className="font-header rounded bg-red-600/80 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-60"
            onClick={cancel}
            type="button"
            disabled={!sending}
            title="Cancel current request"
          >
            Cancel
          </button>
        </div>

        {workOrderLineId && (
          <div className="pt-2">
            <button
              className="font-header rounded bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-700 disabled:opacity-60"
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
              Summarize & Export to Work Order
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — Conversation */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="rounded border border-neutral-800 bg-neutral-900 p-3 overflow-y-auto max-h-[560px] space-y-3"
        >
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            const bubbleBase = "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap break-words";
            const userClass = "ml-auto bg-orange-600 text-black";
            const asstClass = "mr-auto bg-black text-gray-200 border border-white/5"; // darker, dimmer

            return isUser ? (
              <div key={i} className={`flex justify-end`}>
                <div className={`${bubbleBase} ${userClass}`}>{m.content}</div>
              </div>
            ) : (
              <div key={i} className={`flex justify-start`}>
                <div className={`${bubbleBase} ${asstClass}`}>
                  <div className="prose prose-invert prose-sm">
                    {/* Tighten spacing & align headings cleanly */}
                    <style jsx>{`
                      .prose :where(h1, h2, h3, h4){ margin-top: .25rem; margin-bottom: .25rem; }
                      .prose :where(p){ margin: .25rem 0; }
                      .prose :where(ul,ol){ margin: .25rem 0; padding-left: 1.25rem; }
                      .prose :where(li){ margin: .125rem 0; }
                      .prose strong{ font-weight: 700; }
                    `}</style>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing bubble */}
          {(sending || partial.length > 0) && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded px-3 py-2 text-sm bg-black text-gray-300 border border-white/5 opacity-90">
                {partial.length > 0 ? partial : "Assistant is typing…"}
              </div>
            </div>
          )}

          {messages.length === 0 && !sending && partial.length === 0 && (
            <div className="text-xs text-neutral-400">
              Enter vehicle details and notes, then ask a question or attach a photo.
            </div>
          )}
        </div>

        {/* Composer pinned to bottom of the right column */}
        <form onSubmit={onSubmit} className="mt-3 sticky bottom-0 bg-black/60 backdrop-blur rounded border border-neutral-800 p-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
              placeholder="Ask the assistant…"
              disabled={sending}
              aria-label="Ask the assistant"
            />
            <button
              className="font-header rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
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