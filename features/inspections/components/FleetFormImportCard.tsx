"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Button } from "@shared/components/ui/Button";

type Option = { id: string; label: string };
type SignedUpload = {
  path: string;
  token: string;
  originalName: string;
  mime: string;
  size: number;
};
type ImportListItem = {
  id: string;
  state: "queued" | "processing" | "ready_for_review" | "failed" | "approved";
  title: string;
  customerName: string | null;
  fleetName: string | null;
  totalPages: number;
  processedPages: number;
  errorMessage: string | null;
  templateId: string | null;
};

const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/tiff",
]);

const STATE_COPY: Record<ImportListItem["state"], string> = {
  queued: "Uploading complete",
  processing: "Reading form",
  ready_for_review: "Ready for review",
  failed: "Needs another photo",
  approved: "Template saved",
};

function normalizeOptionLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchingOptions(options: Option[], query: string) {
  const normalizedQuery = normalizeOptionLabel(query);
  if (!normalizedQuery) return options.slice(0, 8);
  return options
    .filter((option) =>
      normalizeOptionLabel(option.label).includes(normalizedQuery),
    )
    .slice(0, 8);
}

function ImportDirectoryField({
  label,
  placeholder,
  options,
  value,
  selectedId,
  onChange,
  onSelect,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  selectedId: string;
  onChange: (value: string, matchingId: string) => void;
  onSelect: (option: Option) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const matches = useMemo(
    () => matchingOptions(options, value),
    [options, value],
  );
  const selected = options.find((option) => option.id === selectedId) ?? null;

  return (
    <div className="relative text-xs text-[color:var(--theme-text-secondary)]">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const nextValue = event.target.value;
          const exactMatch = options.find(
            (option) =>
              normalizeOptionLabel(option.label) ===
              normalizeOptionLabel(nextValue),
          );
          onChange(nextValue, exactMatch?.id ?? "");
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]"
      />

      {open && matches.length ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-1 shadow-[var(--theme-shadow-large)]"
        >
          {matches.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === selectedId}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-3 text-left text-sm text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] active:bg-[color:var(--theme-surface-subtle)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-1 text-[0.7rem] font-medium text-emerald-400">
          Selected: {selected.label}
        </div>
      ) : value.trim() ? (
        <div className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">
          Select a match to link the record, or keep this as a typed name.
        </div>
      ) : null}
    </div>
  );
}

export default function FleetFormImportCard({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [dutyClass, setDutyClass] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [fleetName, setFleetName] = useState("");
  const [customers, setCustomers] = useState<Option[]>([]);
  const [fleets, setFleets] = useState<Option[]>([]);
  const [imports, setImports] = useState<ImportListItem[]>([]);
  const [importReady, setImportReady] = useState<boolean | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadImports = useCallback(async () => {
    const response = await fetch("/api/inspection-form-imports", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      imports?: ImportListItem[];
      customers?: Option[];
      fleets?: Option[];
      importReady?: boolean;
      setupError?: string | null;
      error?: string;
    } | null;
    if (response.ok) {
      setImports(body?.imports ?? []);
      setCustomers(body?.customers ?? []);
      setFleets(body?.fleets ?? []);
      setImportReady(body?.importReady ?? true);
      setSetupError(body?.setupError ?? null);
    } else {
      setImportReady(false);
      setSetupError(body?.error || "Unable to load customers and fleets.");
    }
  }, []);

  useEffect(() => {
    void loadImports();
  }, [loadImports]);

  useEffect(() => {
    if (
      !imports.some(
        (item) => item.state === "queued" || item.state === "processing",
      )
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadImports();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [imports, loadImports]);

  const addFiles = (incoming: File[]) => {
    setError(null);
    const invalid = incoming.find(
      (file) => !ACCEPTED.has(file.type) || !file.size,
    );
    if (invalid) {
      setError(`${invalid.name || "That file"} is not a supported form image.`);
      return;
    }
    setFiles((current) => [...current, ...incoming].slice(0, 12));
  };

  const move = (index: number, direction: -1 | 1) => {
    setFiles((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.length) {
      setError("Photograph or select at least one page.");
      return;
    }
    if (importReady === false) {
      setError(setupError || "Form importing is temporarily unavailable.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const prepareResponse = await fetch("/api/inspection-form-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
        }),
      });
      const prepareBody = (await prepareResponse.json().catch(() => null)) as {
        uploadId?: string;
        uploads?: SignedUpload[];
        error?: string;
      } | null;
      if (
        !prepareResponse.ok ||
        !prepareBody?.uploadId ||
        !prepareBody.uploads
      ) {
        throw new Error(
          prepareBody?.error || "Unable to prepare the form upload.",
        );
      }

      for (let index = 0; index < prepareBody.uploads.length; index += 1) {
        const upload = prepareBody.uploads[index];
        const file = files[index];
        const { error: uploadError } = await supabase.storage
          .from("fleet-forms")
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: upload.mime,
            upsert: false,
          });
        if (uploadError) {
          throw new Error(
            `Unable to upload page ${index + 1}. ${uploadError.message}`,
          );
        }
      }

      const response = await fetch("/api/inspection-form-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          uploadId: prepareBody.uploadId,
          uploads: prepareBody.uploads.map((upload) => ({
            path: upload.path,
            originalName: upload.originalName,
            mime: upload.mime,
            size: upload.size,
          })),
          title,
          vehicleType,
          dutyClass,
          customerId,
          customerName,
          fleetId,
          fleetName,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        jobId?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.jobId) {
        throw new Error(body?.error || "Unable to finish the form upload.");
      }
      router.push(
        mobile
          ? `/mobile/inspections/import/${body.jobId}`
          : `/inspections/fleet-review?jobId=${body.jobId}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to upload the form.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)] md:p-5"
      >
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
            Import customer form
          </div>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Photograph every page. You can leave while ProFixIQ reads it and
            review it on any signed-in device.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ImportDirectoryField
            label="Customer (optional)"
            placeholder="Search or type a customer name"
            options={customers}
            value={customerName}
            selectedId={customerId}
            onChange={(value, matchingId) => {
              setCustomerName(value);
              setCustomerId(matchingId);
            }}
            onSelect={(option) => {
              setCustomerName(option.label);
              setCustomerId(option.id);
            }}
          />
          <ImportDirectoryField
            label="Fleet account (optional)"
            placeholder="Search or type a fleet name"
            options={fleets}
            value={fleetName}
            selectedId={fleetId}
            onChange={(value, matchingId) => {
              setFleetName(value);
              setFleetId(matchingId);
            }}
            onSelect={(option) => {
              setFleetName(option.label);
              setFleetId(option.id);
            }}
          />
          <label className="text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">
            Template name (optional)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ABC Logistics annual inspection"
              className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]"
            />
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Vehicle type
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]"
            >
              <option value="">Not specified</option>
              <option value="car">Car / SUV</option>
              <option value="truck">Truck / tractor</option>
              <option value="bus">Bus / coach</option>
              <option value="trailer">Trailer</option>
              <option value="mixed">Mixed fleet</option>
            </select>
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Duty class
            <select
              value={dutyClass}
              onChange={(e) => setDutyClass(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]"
            >
              <option value="">Not specified</option>
              <option value="light">Light duty</option>
              <option value="medium">Medium duty</option>
              <option value="heavy">Heavy duty</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-2xl border border-[var(--accent-copper)] bg-[color:var(--theme-surface-subtle)] px-3 text-center text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-center text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Choose photos
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {files.length ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Pages in reading order
            </div>
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--theme-surface-subtle)] font-semibold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Move page ${index + 1} up`}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="px-2 py-1 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move page ${index + 1} down`}
                  onClick={() => move(index, 1)}
                  disabled={index === files.length - 1}
                  className="px-2 py-1 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, fileIndex) => fileIndex !== index),
                    )
                  }
                  className="px-2 py-1 text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {setupError ? (
          <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-950/30 p-3 text-sm text-amber-100">
            {setupError}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        <Button
          type="submit"
          variant="copper"
          size="lg"
          isLoading={submitting}
          disabled={!files.length || importReady === false}
          className="mt-4 w-full"
        >
          Upload and process
        </Button>
      </form>

      {imports.length ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">
            Recent form imports
          </h2>
          <div className="mt-2 space-y-2">
            {imports.map((item) => {
              const href = mobile
                ? `/mobile/inspections/import/${item.id}`
                : `/inspections/fleet-review?jobId=${item.id}`;
              return (
                <Link
                  key={item.id}
                  href={href}
                  className="block rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {item.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                        {item.customerName || item.fleetName || "Shop template"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px] uppercase tracking-[0.12em]">
                      {STATE_COPY[item.state]}
                    </span>
                  </div>
                  {item.state === "queued" || item.state === "processing" ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-inset)]">
                      <div
                        className="h-full bg-[var(--accent-copper)]"
                        style={{
                          width: `${Math.max(8, Math.round((item.processedPages / Math.max(1, item.totalPages)) * 100))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
