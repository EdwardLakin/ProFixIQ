"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@shared/components/ui/Button";

type DutyClass = "light" | "medium" | "heavy";

type UploadStatus = "parsed" | "failed" | "processing" | string;

type UploadResponse = {
  id: string;
  status: UploadStatus;
  storage_path?: string | null;
  error?: string | null;
};

export default function FleetFormImportCard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [vehicleType, setVehicleType] = useState<string>("");
  const [dutyClass, setDutyClass] = useState<DutyClass | "">("");
  const [titleHint, setTitleHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("Upload a fleet inspection form (PDF or image).");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (vehicleType) formData.append("vehicleType", vehicleType);
      if (dutyClass) formData.append("dutyClass", dutyClass);
      if (titleHint) formData.append("titleHint", titleHint);

      const res = await fetch("/api/fleet/forms/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json().catch(() => null)) as
        | UploadResponse
        | { error?: string }
        | null;

      // Network / server error?
      if (!res.ok) {
        const err =
          (data && "error" in data && typeof data.error === "string"
            ? data.error
            : null) || `Upload failed (${res.status})`;
        setErrorMsg(err);
        return;
      }

      if (!data || !("id" in data)) {
        setErrorMsg("Upload succeeded but response was incomplete.");
        return;
      }

      const uploadData = data as UploadResponse;

      if (!uploadData.id) {
        setErrorMsg("Upload succeeded but no upload id was returned.");
        return;
      }

      // If the scan failed, show the *actual* error from the route.
      if (uploadData.status !== "parsed") {
        const detailedError =
          (uploadData.error && uploadData.error.trim().length > 0
            ? uploadData.error
            : null) ??
          `Form uploaded but scan did not complete successfully (status: ${uploadData.status}).`;

        // Also log for debugging in dev tools
        // eslint-disable-next-line no-console
        console.error("Fleet form scan failed:", uploadData);

        setErrorMsg(detailedError);
        return;
      }

      // Forward user into the Review & Map screen
      const qs = new URLSearchParams();
      qs.set("uploadId", uploadData.id);
      if (vehicleType) qs.set("vehicleType", vehicleType);
      if (dutyClass) qs.set("dutyClass", dutyClass);
      if (titleHint) qs.set("titleHint", titleHint);

      router.push(`/inspections/fleet/review?${qs.toString()}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Fleet import error:", err);
      setErrorMsg("Unexpected error uploading fleet form.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="
        relative rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)]
        bg-black/65 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl p-5
      "
    >
      {/* Copper glow wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_65%)]"
      />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-blackops uppercase tracking-[0.18em] text-neutral-400">
            Fleet Form Import
          </div>
          <p className="mt-1 text-xs text-neutral-300">
            Convert any fleet’s current inspection sheet into a ProFixIQ
            template.
          </p>
        </div>

        <span className="rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-400">
          Beta
        </span>
      </div>

      {/* FILE + TITLE */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {/* File input */}
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Fleet form file
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            className="
              rounded-xl border border-[color:var(--metal-border-soft,#374151)]
              bg-black/70 px-3 py-2 text-xs text-white
              file:mr-2 file:rounded-lg file:border file:border-[color:var(--metal-border-soft,#374151)]
              file:bg-black/50 file:px-3 file:py-1.5 file:text-[10px] file:uppercase
              file:tracking-[0.18em] file:text-neutral-300
              hover:file:bg-black/70
            "
          />
          <span className="mt-1 text-[10px] text-neutral-500">
            Clear PDFs or phone photos work best.
          </span>
        </label>

        {/* Title hint */}
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Optional title
          <input
            value={titleHint}
            onChange={(e) => setTitleHint(e.target.value)}
            placeholder="ABC Logistics – Daily Truck Inspection"
            className="
              rounded-xl border border-[color:var(--metal-border-soft,#374151)]
              bg-black/70 px-3 py-2 text-xs text-white placeholder:text-neutral-500
            "
          />
        </label>
      </div>

      {/* VEHICLE TYPE + DUTY + SUBMIT */}
      <div className="mb-4 grid gap-4 md:grid-cols-[1fr,1fr,auto]">
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Vehicle type
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="
              rounded-xl border border-[color:var(--metal-border-soft,#374151)]
              bg-black/70 px-3 py-2 text-xs text-white
            "
          >
            <option value="">Not specified</option>
            <option value="car">Car / SUV</option>
            <option value="truck">Truck / Tractor</option>
            <option value="bus">Bus / Coach</option>
            <option value="trailer">Trailer</option>
            <option value="mixed">Mixed Fleet</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Duty class
          <select
            value={dutyClass}
            onChange={(e) => setDutyClass(e.target.value as DutyClass | "")}
            className="
              rounded-xl border border-[color:var(--metal-border-soft,#374151)]
              bg-black/70 px-3 py-2 text-xs text-white
            "
          >
            <option value="">Not specified</option>
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="heavy">Heavy</option>
          </select>
          <span className="mt-1 text-[10px] text-neutral-500">
            Helps auto-select hydraulic or air brake grids.
          </span>
        </label>

        <div className="flex flex-col justify-end">
          <Button
            type="submit"
            disabled={loading}
            className="
              w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)]
              bg-black/70 px-4 py-2 text-[11px] uppercase tracking-[0.16em]
              text-neutral-200 hover:bg-black/80 hover:border-neutral-500
              disabled:opacity-50
            "
          >
            {loading ? "Uploading & scanning…" : "Upload & Scan"}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {!errorMsg && (
        <p className="mt-2 text-[10px] text-neutral-500">
          Upload → AI reads the layout → Review & map sections → Save as
          template.
        </p>
      )}
    </form>
  );
}