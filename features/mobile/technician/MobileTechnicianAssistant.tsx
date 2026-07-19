"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  useTechAssistant,
  type Vehicle,
} from "@/features/ai/hooks/useTechAssistant";

type Props = {
  defaultVehicle?: Vehicle;
  workOrderLineId?: string;
};

function vehicleLabel(vehicle?: Vehicle): string {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export default function MobileTechnicianAssistant({
  defaultVehicle,
  workOrderLineId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [photoNote, setPhotoNote] = useState("");

  const {
    vehicle,
    setVehicle,
    context,
    setContext,
    messages,
    sending,
    uploading,
    partial,
    error,
    sendChat,
    sendPhoto,
    resetConversation,
    cancel,
  } = useTechAssistant({ defaultVehicle, workOrderLineId });

  useEffect(() => {
    if (
      defaultVehicle &&
      (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))
    ) {
      setVehicle(defaultVehicle);
    }
    // Seed the job vehicle once without replacing restored route state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicle]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages, partial, sending]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );
  const currentVehicle = vehicleLabel(vehicle);
  const inputClass =
    "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/35";

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const question = inputRef.current?.value?.trim();
    if (!question) return;
    void sendChat(question);
    if (inputRef.current) inputRef.current.value = "";
  };

  const attachPhoto = (
    file: File | null,
    input: HTMLInputElement | null,
  ) => {
    if (!file) return;
    void sendPhoto(file, photoNote).finally(() => {
      if (input) input.value = "";
      setPhotoNote("");
    });
  };

  return (
    <div className="space-y-3 text-sm text-[color:var(--theme-text-primary)]">
      <details
        open={!canSend}
        className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Vehicle &amp; job context
            </div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-primary)]">
              {currentVehicle || "Vehicle details required"}
            </div>
          </div>
          <span className="shrink-0 text-xs text-[color:var(--theme-text-muted)]">
            Edit
          </span>
        </summary>

        <div className="space-y-3 border-t border-[color:var(--theme-border-soft)] px-3 py-3">
          <div>
            <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Vehicle
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                className={`${inputClass} py-2 text-sm`}
                placeholder="Year"
                value={vehicle?.year ?? ""}
                onChange={(event) =>
                  setVehicle({
                    ...(vehicle ?? { make: "", model: "" }),
                    year: event.target.value,
                  })
                }
              />
              <input
                className={`${inputClass} py-2 text-sm`}
                placeholder="Make"
                value={vehicle?.make ?? ""}
                onChange={(event) =>
                  setVehicle({
                    ...(vehicle ?? { year: "", model: "" }),
                    make: event.target.value,
                  })
                }
              />
              <input
                className={`${inputClass} py-2 text-sm`}
                placeholder="Model"
                value={vehicle?.model ?? ""}
                onChange={(event) =>
                  setVehicle({
                    ...(vehicle ?? { year: "", make: "" }),
                    model: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Symptoms, readings, or DTCs
            </div>
            <textarea
              className={`${inputClass} min-h-20 py-2 text-sm`}
              placeholder="Add the details that matter for this question."
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </div>

          <div>
            <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Diagnostic photo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={sending || uploading || !workOrderLineId}
                className="min-h-11 rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[color:var(--theme-surface-inset)] px-3 text-xs font-semibold disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Take photo"}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={sending || uploading || !workOrderLineId}
                className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-xs font-semibold disabled:opacity-50"
              >
                Choose photo
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) =>
                attachPhoto(
                  event.target.files?.[0] ?? null,
                  cameraRef.current,
                )
              }
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(event) =>
                attachPhoto(event.target.files?.[0] ?? null, fileRef.current)
              }
            />
            <input
              className={`${inputClass} mt-2 py-2 text-xs`}
              placeholder="Optional note for the photo"
              value={photoNote}
              onChange={(event) => setPhotoNote(event.target.value)}
              disabled={sending || uploading}
            />
            {!workOrderLineId ? (
              <p className="mt-1 text-[0.68rem] text-[color:var(--theme-text-muted)]">
                Open the assistant from a job before adding a diagnostic photo.
              </p>
            ) : null}
          </div>
        </div>
      </details>

      <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] shadow-[var(--theme-shadow-soft)]">
        <div
          ref={scrollRef}
          className="max-h-[46dvh] min-h-[220px] space-y-3 overflow-y-auto p-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {messages.length === 0 && !sending ? (
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              Ask a direct question about diagnosis, testing, specifications, or
              the repair procedure. ProFixIQ uses the vehicle and job context;
              the technician decides what is correct and what is used.
            </div>
          ) : null}

          {messages.map((message, index) => {
            const mine = message.role === "user";
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[94%] rounded-2xl px-3 py-2 text-sm leading-5 ${
                    mine
                      ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] font-medium text-[color:var(--theme-text-on-accent)]"
                      : "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]"
                  }`}
                >
                  {mine ? (
                    <>
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                      {message.attachments?.length ? (
                        <div className="mt-2 space-y-1 text-[0.68rem]">
                          {message.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 rounded-lg bg-black/10 p-1"
                            >
                              {attachment.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={attachment.url}
                                  alt={
                                    attachment.fileName ??
                                    "Attached diagnostic photo"
                                  }
                                  className="h-12 w-12 rounded-lg object-cover"
                                />
                              ) : null}
                              <span className="truncate">
                                {attachment.fileName ?? "Diagnostic photo"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none !text-[color:var(--theme-text-primary)]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="my-1">{children}</p>,
                          li: ({ children }) => (
                            <li className="my-0.5">{children}</li>
                          ),
                          ul: ({ children }) => (
                            <ul className="my-1 list-disc pl-5">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="my-1 list-decimal pl-5">{children}</ol>
                          ),
                          h3: ({ children }) => (
                            <h3 className="mb-1 mt-2 text-sm font-semibold">
                              {children}
                            </h3>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(sending || partial.length > 0) && (
            <div className="flex justify-start">
              <div className="max-w-[94%] rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
                {partial || "ProFixIQ is checking the available context…"}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={submitQuestion}
          className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
        >
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className={`${inputClass} min-h-11 flex-1 py-2.5 text-sm`}
              placeholder={
                canSend
                  ? "Ask about this vehicle or job…"
                  : "Add year, make, and model above"
              }
              disabled={sending || uploading}
            />
            <button
              className="min-h-11 rounded-xl bg-[color:var(--accent-copper)] px-4 text-xs font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-50"
              disabled={sending || uploading || !canSend}
              type="submit"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetConversation}
              disabled={sending || uploading || messages.length === 0}
              className="text-[0.68rem] font-medium text-[color:var(--theme-text-secondary)] disabled:opacity-45"
            >
              Clear conversation
            </button>
            {sending ? (
              <button
                type="button"
                onClick={cancel}
                className="text-[0.68rem] font-medium text-red-300"
              >
                Stop response
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
