"use client";

import type React from "react";
import { useState } from "react";
import { toast } from "sonner";

export type SignatureRole = "technician" | "customer" | "advisor";

export type InspectionSignaturePanelProps = {
  inspectionId: string | null | undefined;
  role: SignatureRole;
  defaultName?: string;
  onSigned?: () => void;

  /**
   * Optional: where to send a tech to save their signature (one-time setup).
   * If omitted, we’ll just show a toast message.
   */
  techSettingsHref?: string;
};

function roleLabel(role: SignatureRole): string {
  if (role === "technician") return "Technician";
  if (role === "customer") return "Customer";
  return "Service advisor";
}

type SavedSigResponse = {
  ok?: boolean;
  error?: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
};

const InspectionSignaturePanel: React.FC<InspectionSignaturePanelProps> = ({
  inspectionId,
  role,
  defaultName,
  onSigned,
  techSettingsHref,
}) => {
  const [name, setName] = useState(defaultName ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function fetchSavedTechSignature(): Promise<{
    signatureImagePath: string;
    signatureHash: string | null;
  } | null> {
    try {
      const res = await fetch("/api/profile/signature", {
        method: "GET",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });

      const json = (await res.json().catch(() => null)) as SavedSigResponse | null;

      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Failed to load saved signature");
      }

      const path = json?.signatureImagePath ?? null;
      if (!path) return null;

      return {
        signatureImagePath: path,
        signatureHash: json?.signatureHash ?? null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load saved signature";
      toast.error(msg);
      return null;
    }
  }

  const handleSign = async () => {
    if (!inspectionId) {
      toast.error("Inspection ID missing – cannot sign yet.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!confirm) {
      toast.error("Please confirm that you have reviewed the inspection.");
      return;
    }

    if (busy) return;
    setBusy(true);

    try {
      let signatureImagePath: string | null = null;
      let signatureHash: string | null = null;

      // ✅ Technician: pull saved signature automatically
      if (role === "technician") {
        const saved = await fetchSavedTechSignature();
        if (!saved?.signatureImagePath) {
          if (techSettingsHref) {
            toast.error("No saved tech signature. Please add one in Tech Settings.");
            // You can optionally navigate here in your parent, but we won’t force it.
          } else {
            toast.error("No saved tech signature. Add one in Tech Settings.");
          }
          return;
        }
        signatureImagePath = saved.signatureImagePath;
        signatureHash = saved.signatureHash;
      }

      const res = await fetch("/api/inspections/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          inspectionId,
          role,
          signedName: name.trim(),
          signatureImagePath,
          signatureHash,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Signature failed");
      }

      toast.success(`${roleLabel(role)} signature captured.`);
      onSigned?.();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("sign error", e);
      toast.error(e instanceof Error ? e.message : "Unable to save signature.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-800 bg-black/60 p-3 text-xs text-zinc-200">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            {roleLabel(role)} Signature
          </div>
          <div className="text-[11px] text-zinc-500">
            {role === "technician"
              ? "Uses your saved signature (no re-signing every time)."
              : "Sign to lock this inspection snapshot."}
          </div>
        </div>
      </div>

      <label className="mt-1 text-[11px] text-zinc-300">
        Full name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-orange-500"
          placeholder="Type your full legal name"
        />
      </label>

      <label className="flex items-start gap-2 text-[11px] text-zinc-300">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-[1px] h-3 w-3 rounded border border-zinc-600 bg-zinc-900 text-orange-500"
        />
        <span>
          I confirm that I have reviewed this inspection and that the information above
          is accurate to the best of my knowledge.
        </span>
      </label>

      {!inspectionId && (
        <p className="text-[11px] text-amber-300">
          This inspection has not been saved to the database yet. Once it has a
          persistent <code>inspection_id</code>, this panel will allow signing.
        </p>
      )}

      {role === "technician" && (
        <p className="text-[11px] text-zinc-400">
          If signing fails, it usually means no saved signature exists yet.
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={handleSign}
          disabled={busy || !inspectionId}
          className="inline-flex items-center rounded-full border border-orange-500/80 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100 shadow-[0_0_18px_rgba(248,113,113,0.65)] hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing…" : "Sign"}
        </button>
      </div>
    </div>
  );
};

export default InspectionSignaturePanel;