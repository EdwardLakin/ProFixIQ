"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog } from "@headlessui/react";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";
import { useAiPartSuggestions } from "@/features/parts/hooks/useAiPartSuggestions";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

/** Only the fields this modal actually reads/writes */
type ExistingRequestShape = Partial<{
  id: string;
  part_name: string;
  urgency: "low" | "medium" | "high";
  quantity: number;
  notes: string;
  photo_urls: string[];
  archived: boolean;
}>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  workOrderId: string;
  requested_by: string;
  existingRequest?: ExistingRequestShape | null;
  /** Optional: allow AI to use more context */
  vehicleSummary?: { year?: number | string | null; make?: string | null; model?: string | null } | null;
  jobDescription?: string | null;
}

export default function PartsRequestModal(props: Props) {
  const {
    isOpen,
    onClose,
    jobId,
    workOrderId,
    requested_by,
    existingRequest = null,
    vehicleSummary = null,
    jobDescription = null,
  } = props;

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string>("");
  const [partsNeeded, setPartsNeeded] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // optional link to an inventory part
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PartRow[]>([]);
  const [selectedPart, setSelectedPart] = useState<PartRow | null>(null);

  // AI
  const { loading: aiLoading, items: aiItems, error: aiErr, suggest, setItems: setAiItems } =
    useAiPartSuggestions();

  // preload if editing an existing request
  useEffect(() => {
    if (existingRequest) {
      setPartsNeeded(existingRequest.part_name || "");
      setUrgency(existingRequest.urgency ?? "medium");
      setNotes(existingRequest.notes || "");
      setQuantity(existingRequest.quantity ?? 1);
      setPhotoUrls(existingRequest.photo_urls ?? []);
    } else {
      setPartsNeeded("");
      setUrgency("medium");
      setNotes("");
      setQuantity(1);
      setPhotoUrls([]);
      setSelectedPart(null);
      setSearchTerm("");
      setResults([]);
      setAiItems([]); // clear AI list on fresh open
    }
  }, [existingRequest, isOpen, setAiItems]);

  // load user shop for scoping part search
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();
      setShopId((prof?.shop_id as string) ?? "");
    })();
  }, [supabase]);

  // parts quick search (name/SKU) within shop
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !shopId) return;
    const term = searchTerm.trim();
    if (!term) {
      setResults([]);
      return;
    }
    (async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("parts")
          .select("*")
          .eq("shop_id", shopId)
          .limit(8)
          .order("name", { ascending: true })
          .or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
        if (error) throw error;
        if (!cancelled) setResults((data as PartRow[]) ?? []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[parts search] failed:", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shopId, searchTerm, supabase]);

  const resetForm = () => {
    setPartsNeeded("");
    setUrgency("medium");
    setNotes("");
    setQuantity(1);
    setPhotoUrls([]);
    setSelectedPart(null);
    setSearchTerm("");
    setResults([]);
    setAiItems([]);
  };

  const handleSubmit = async () => {
    if (!partsNeeded.trim() && !selectedPart) {
      toast.error("Provide ‘Parts needed’ or select an inventory part.");
      return;
    }

    // If user linked a part but left “Parts needed” empty, auto-fill with part name
    const finalPartName = partsNeeded.trim() || (selectedPart?.name?.toString() ?? "").trim();
    if (!finalPartName) {
      toast.error("Part name is required.");
      return;
    }

    // Append a tiny note referencing the linked part
    const linkedNote = selectedPart
      ? `\n\n[Linked Part: ${selectedPart.name ?? "Part"} • SKU ${selectedPart.sku ?? "—"}]`
      : "";

    const payload = {
      id: existingRequest?.id || uuidv4(),
      job_id: jobId,
      work_order_id: workOrderId,
      part_name: finalPartName,
      urgency,
      quantity,
      notes: (notes?.trim() || "") + linkedNote,
      requested_by,
      photo_urls: photoUrls,
      viewed_at: null,
      fulfilled_at: null,
      archived: existingRequest?.archived ?? false,
    };

    // Use the table name you’re using elsewhere (we’ve been using "part_requests")
    const table = "part_requests";

    const { error } = existingRequest
      ? await supabase.from(table).update(payload).eq("id", payload.id)
      : await supabase.from(table).insert(payload);

    if (error) {
      toast.error("Failed to submit parts request: " + error.message);
    } else {
      toast.success(existingRequest ? "Request updated." : "Parts request submitted.");
      window.dispatchEvent(new CustomEvent("parts:request-created"));
      resetForm();
      setTimeout(onClose, 600);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxFiles = Math.max(0, 5 - photoUrls.length);
    const filesToUpload = Array.from(files).slice(0, maxFiles);
    if (!filesToUpload.length) return;

    setUploading(true);
    try {
      for (const file of filesToUpload) {
        const fileName = `${uuidv4()}-${file.name}`;
        const { data, error } = await supabase
          .storage
          .from("parts-request-photos")
          .upload(fileName, file);
        if (error) {
          toast.error(`Upload failed: ${file.name}`);
          continue;
        }
        const { data: pub } = supabase
          .storage
          .from("parts-request-photos")
          .getPublicUrl(data!.path);
        const url = pub?.publicUrl ?? "";
        if (url) setPhotoUrls((prev) => [...prev, url]);
      }
    } finally {
      setUploading(false);
    }
  };

  async function runSuggest() {
    await suggest({
      workOrderId,
      workOrderLineId: jobId,
      vehicle: vehicleSummary ?? null,
      description: partsNeeded || jobDescription || "",
      notes,
      topK: 5,
    });
    // If form is empty, prefill a reasonable default from top suggestion
    setTimeout(() => {
      if (!partsNeeded && aiItems[0]?.name) setPartsNeeded(aiItems[0].name);
      if (!notes && aiItems[0]?.rationale) setNotes(aiItems[0].rationale || "");
    }, 0);
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-[320] flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 z-[320] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-[330] mx-4 my-6 w-full">
        <Dialog.Panel className="w-full max-w-md rounded border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl">
          <Dialog.Title className="mb-4 font-header text-lg font-semibold tracking-wide">
            {existingRequest ? "Edit Parts Request" : "Request Parts"}
          </Dialog.Title>

          {/* AI Assist row */}
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-neutral-300">AI Assist</div>
            <button
              onClick={runSuggest}
              disabled={aiLoading}
              className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
              title="Suggest parts from job context"
            >
              {aiLoading ? "Thinking…" : "Suggest"}
            </button>
          </div>
          {aiErr && <div className="mb-2 text-xs text-red-400">{aiErr}</div>}
          {!aiLoading && !!aiItems.length && (
            <div className="mb-3 flex flex-wrap gap-2">
              {aiItems.map((s, i) => (
                <button
                  key={i}
                  onClick={async () => {
                    if (!partsNeeded) setPartsNeeded(s.name);
                    if (!notes && s.rationale) setNotes(s.rationale);
                    // try to link to an inventory part by SKU or name
                    if (s.sku && shopId) {
                      const { data } = await supabase
                        .from("parts")
                        .select("*")
                        .eq("shop_id", shopId)
                        .eq("sku", s.sku)
                        .maybeSingle();
                      if (data) setSelectedPart(data as PartRow);
                    }
                  }}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                  title={s.rationale || ""}
                >
                  {(s.sku ? `${s.sku} • ` : "") + s.name} {s.qty ? `×${s.qty}` : ""}
                </button>
              ))}
            </div>
          )}

          {/* Optional: link to an inventory part */}
          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Link to Inventory (optional)</label>
            {selectedPart ? (
              <div className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-900 p-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{selectedPart.name ?? "Part"}</div>
                  <div className="text-xs text-neutral-400">SKU: {selectedPart.sku ?? "—"}</div>
                </div>
                <button
                  onClick={() => setSelectedPart(null)}
                  className="font-header rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <input
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
                  placeholder="Search by name or SKU…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {!!results.length && (
                  <div className="mt-2 max-h-40 overflow-auto rounded border border-neutral-800 bg-neutral-950">
                    {results.map((p) => (
                      <button
                        key={p.id as string}
                        onClick={() => {
                          setSelectedPart(p);
                          setResults([]);
                          setSearchTerm("");
                          if (!partsNeeded.trim()) setPartsNeeded(p.name ?? "");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-900"
                      >
                        <div className="truncate">{p.name}</div>
                        <div className="text-xs text-neutral-400">SKU: {p.sku ?? "—"}</div>
                      </button>
                    ))}
                  </div>
                )}
                {searching && <div className="mt-1 text-xs text-neutral-400">Searching…</div>}
              </>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Parts Needed*</label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              value={partsNeeded}
              onChange={(e) => setPartsNeeded(e.target.value)}
              placeholder="List the part(s) needed…"
              required
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Quantity</label>
            <input
              type="number"
              min={1}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
              placeholder="1"
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Urgency</label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details, vendor, etc."
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm text-neutral-300">Photos ({photoUrls.length}/5)</label>
            <input
              type="file"
              multiple
              accept="image/*"
              capture="environment"
              disabled={photoUrls.length >= 5 || uploading}
              onChange={handlePhotoUpload}
              className="mb-2"
            />
            <div className="flex flex-wrap gap-2">
              {photoUrls.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="part" className="h-16 w-16 rounded object-cover" />
                  <button
                    onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-0 top-0 font-header rounded border border-red-600 px-1 text-xs text-red-300 hover:bg-red-900/20"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="font-header rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="font-header rounded border border-orange-500 px-4 py-2 text-sm hover:bg-orange-500/10 disabled:opacity-60"
            >
              {existingRequest ? "Update Request" : "Submit Request"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}