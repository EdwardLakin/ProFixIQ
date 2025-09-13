"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LS_KEY = "profixiq:ta:v1";

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
    messages, setMessages,
    sending, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  /* ---------- persist/restore (vehicle, context, messages) ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        vehicle?: Vehicle;
        context?: string;
        messages?: { role: "user" | "assistant"; content: string }[];
      };
      if (parsed.vehicle) setVehicle(parsed.vehicle);
      if (typeof parsed.context === "string") setContext(parsed.context);
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        setMessages(parsed.messages);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const payload = JSON.stringify({ vehicle, context, messages });
      localStorage.setItem(LS_KEY, payload);
    } catch {}
  }, [vehicle, context, messages]);

  // Seed default vehicle once (but don't clobber a restored vehicle)
  useEffect(() => {
    if (
      defaultVehicle &&
      (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))
    ) {
      setVehicle(defaultVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendChat(text);
    if (inputRef.current) inputRef.current.value = "";
  };

  const dtcValid =
    /^([PBUC])\d{4}$/i.test(dtc.trim()) ||
    /^P0\d{3}$/i.test(dtc.trim());

  const VehicleInputs = (
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
  );

  const ControlsRow = (
    <>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          placeholder="Ask the assistant…"
          aria-label="Ask the assistant"
          disabled={sending}
        />
        <button
          className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
          disabled={sending}
          type="submit"
          title="Send"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-28 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          placeholder="DTC (e.g. P0131)"
          aria-label="DTC input"
          value={dtc}
          onChange={(e) => setDtc(e.target.value.toUpperCase())}
          disabled={sending}
        />
        <input
          className="min-w-48 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          placeholder="Optional notes (symptoms, readings, conditions)"
          aria-label="DTC notes"
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
              if (f) {
                void sendPhoto(f, note).finally(() => {
                  if (fileRef.current) fileRef.current.value = "";
                });
              }
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
    </>
  );

  const Conversation = (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-3 overflow-y-auto max-h-[560px] space-y-3">
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        const bubbleBase =
          "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap break-words";
        const bubbleClass = isUser
          ? "ml-auto bg-orange-600 text-black"
          : "mr-auto bg-neutral-700 text-neutral-100";

        if (!isUser) {
          return (
            <div key={i} className={`${bubbleBase} ${bubbleClass}`}>
              <div className="prose prose-invert prose-sm markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    li: ({ children }) => <li className="my-0.5">{children}</li>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-2">{children}</ol>,
                    h2: ({ children }) => <h2 className="text-base font-semibold mt-2 mb-1">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                    p:  ({ children }) => <p className="my-1">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className={`${bubbleBase} ${bubbleClass}`}>
            {m.content}
          </div>
        );
      })}

      {messages.length === 0 && !sending && (
        <div className="text-xs text-neutral-400">
          Start by entering the vehicle, then ask a question, paste a DTC, or send a photo.
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-white">
      <div className="space-y-4">
        {VehicleInputs}

        <textarea
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400"
          rows={3}
          placeholder="Context/observations (DMM readings, symptoms, conditions, etc.)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          aria-label="Context"
        />

        {ControlsRow}

        {error && (
          <div className="rounded border border-red-600 bg-red-950/40 text-red-200 px-3 py-2">
            {error}
          </div>
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

      <div>{Conversation}</div>
    </div>
  );
}