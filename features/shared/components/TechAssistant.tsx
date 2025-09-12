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
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // local UI state
  const [dtc, setDtc] = useState("");
  const [note, setNote] = useState("");

  // hook
  const {
    vehicle, setVehicle,
    context, setContext,
    messages, sending, partial, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder,
    resetConversation, cancel,
  } = useTechAssistant();

  // Seed default vehicle once
  useEffect(() => {
    if (defaultVehicle && !vehicle) setVehicle(defaultVehicle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  // handlers
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

  // small helpers
  const inputBase =
    "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 " +
    "text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500";

  const VehicleInputs = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input
        className={inputBase}
        aria-label="Vehicle year"
        placeholder="Year"
        value={vehicle?.year ?? ""}
        onChange={(e) =>
          setVehicle({ ...(vehicle ?? { make: "", model: "" }), year: e.target.value })
        }
      />
      <input
        className={inputBase}
        aria-label="Vehicle make"
        placeholder="Make"
        value={vehicle?.make ?? ""}
        onChange={(e) =>
          setVehicle({ ...(vehicle ?? { year: "", model: "" }), make: e.target.value })
        }
      />
      <input
        className={inputBase}
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
      {/* Chat input */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          className={`${inputBase}`}
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

      {/* DTC / Notes / Photo / Reset / Cancel */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputBase} w-32 sm:w-28`}
          placeholder="DTC (e.g. P0131)"
          aria-label="DTC input"
          value={dtc}
          onChange={(e) => setDtc(e.target.value.toUpperCase())}
          disabled={sending}
        />
        <input
          className={`${inputBase} min-w-40 flex-1`}
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

      {!dtcValid && dtc.length > 0 && (
        <div className=" -mt-1 text-xs text-red-400">Enter a valid OBD-II code (e.g. P0131).</div>
      )}
    </>
  );

  const Conversation = (
    <div
      className={
        // On phones, cap to ~55vh so the keyboard doesn’t cover it; on md+ keep the taller max.
        "space-y-3 overflow-y-auto rounded border border-neutral-800 bg-neutral-900 p-3 " +
        "max-h-[55vh] md:max-h-[560px]"
      }
    >
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        const bubbleBase =
          "max-w-[85%] whitespace-pre-wrap break-words rounded px-3 py-2 text-sm";
        const bubbleClass = isUser
          ? "ml-auto bg-orange-600 text-black"
          : "mr-auto bg-neutral-700 text-neutral-100";
        const content = m.content;

        return (
          <div key={i} className={`${bubbleBase} ${bubbleClass} font-header`}>
            {content}
          </div>
        );
      })}

      {!!partial && (
        <div className="mr-auto max-w-[85%] rounded bg-neutral-700 px-3 py-2 text-sm text-neutral-100 opacity-90 font-header">
          {partial || "Assistant is typing…"}
        </div>
      )}

      {messages.length === 0 && !partial && (
        <div className="text-xs text-neutral-400 font-header">
          Start by entering the vehicle, then ask a question, paste a DTC, or send a photo.
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 text-sm text-white md:grid-cols-2 md:gap-6">
      {/* LEFT: Inputs */}
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-lg font-header text-orange-500">Tech Assistant</h2>

        {/* Vehicle */}
        {VehicleInputs}

        {/* Context */}
        <textarea
          className={`${inputBase} h-24 sm:h-28`}
          placeholder="Context/observations (DMM readings, symptoms, conditions, etc.)"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          aria-label="Context"
        />

        {/* Controls */}
        {ControlsRow}

        {/* Error */}
        {error && (
          <div className="rounded border border-red-600 bg-red-950/40 px-3 py-2 text-red-200">
            {error}
          </div>
        )}

        {/* Export to Work Order */}
        {workOrderLineId && (
          <div className="pt-1 sm:pt-2">
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
      <div>{Conversation}</div>
    </div>
  );
}