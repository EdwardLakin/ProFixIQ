"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";

export default function TechAssistant({
  defaultVehicle,
  workOrderLineId,
}: {
  defaultVehicle?: Vehicle;
  /** If provided, shows an “Export to Work Order” button */
  workOrderLineId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dtc, setDtc] = useState("");
  const [note, setNote] = useState("");

  const {
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  // Seed default vehicle ONCE (no setState during render)
  useEffect(() => {
    if (defaultVehicle && !vehicle) {
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

  const dtcValid = /^([PBUC])\d{4}$/i.test(dtc.trim()) || /^P0\d{3}$/i.test(dtc.trim());

  return (
    <div className="space-y-4 text-sm">
      {/* Vehicle & Context */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          className="input"
          aria-label="Vehicle year"
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
          className="input"
          aria-label="Vehicle make"
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
          className="input"
          aria-label="Vehicle model"
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

      <textarea
        className="w-full border rounded p-2 bg-neutral-900 border-neutral-700"
        rows={2}
        placeholder="Context/observations (DMM readings, symptoms, conditions, etc.)"
        value={context}
        onChange={(e) => setContext(e.target.value)}
        aria-label="Context"
      />

      {/* Chat / DTC / Photo controls */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 input"
          placeholder="Ask the assistant…"
          aria-label="Ask the assistant"
        />
        <button className="btn" disabled={sending} type="submit">
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <input
          className="input w-36"
          placeholder="DTC (e.g. P0131)"
          aria-label="DTC input"
          value={dtc}
          onChange={(e) => setDtc(e.target.value.toUpperCase())}
        />
        <input
          className="input flex-1 min-w-48"
          placeholder="Optional notes (symptoms, readings, conditions)"
          aria-label="DTC notes"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn"
          disabled={sending || !dtcValid}
          onClick={() => sendDtc(dtc.trim().toUpperCase(), note)}
          type="button"
          title={!dtcValid ? "Enter a valid DTC (e.g. P0131)" : "Analyze DTC"}
        >
          Analyze DTC
        </button>

        <label className="btn-secondary cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void sendPhoto(f, note).finally(() => {
                  // allow uploading the same file again
                  if (fileRef.current) fileRef.current.value = "";
                });
              }
            }}
          />
          Send Photo
        </label>

        <button className="btn-secondary" onClick={resetConversation} type="button">
          Reset
        </button>
        <button className="btn-danger" onClick={cancel} type="button">
          Cancel
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-600 bg-red-950/40 text-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "rounded p-3 bg-neutral-800"
                : "rounded p-3 bg-neutral-700"
            }
          >
            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
              {m.content}
            </div>
          </div>
        ))}
        {!!partial && (
          <div className="rounded p-3 bg-neutral-700 opacity-90">
            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
              {partial}
            </div>
          </div>
        )}
      </div>

      {/* Export to WO */}
      {workOrderLineId && (
        <div className="pt-2">
          <button
            className="btn bg-purple-600 hover:bg-purple-700"
            disabled={sending}
            onClick={async () => {
              try {
                const res = await exportToWorkOrder(workOrderLineId);
                alert(
                  `Exported:\nCause: ${res.cause}\nCorrection: ${res.correction}\nLabor: ${
                    res.estimatedLaborTime ?? "—"
                  }h`
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
  );
}