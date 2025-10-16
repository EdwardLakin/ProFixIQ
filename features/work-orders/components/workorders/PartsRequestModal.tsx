"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";

type PartsRequest = Database["public"]["Tables"]["parts_requests"]["Insert"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  workOrderId: string;
  requested_by: string;
  existingRequest?: Partial<PartsRequest> | null;
}

export default function PartsRequestModal(props: any) {
  const {
    isOpen,
    onClose,
    jobId,
    workOrderId,
    requested_by,
    existingRequest = null,
  } = props as Props;

  const supabase = createClientComponentClient<Database>();

  const [partsNeeded, setPartsNeeded] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // preload if editing an existing request
  useEffect(() => {
    if (existingRequest) {
      setPartsNeeded(existingRequest.part_name || "");
      setUrgency(
        (existingRequest.urgency as "low" | "medium" | "high") ?? "medium"
      );
      setNotes(existingRequest.notes || "");
      setQuantity(existingRequest.quantity || 1);
      setPhotoUrls(existingRequest.photo_urls || []);
    }
  }, [existingRequest]);

  const resetForm = () => {
    setPartsNeeded("");
    setUrgency("medium");
    setNotes("");
    setQuantity(1);
    setPhotoUrls([]);
  };

  const handleSubmit = async () => {
    if (!partsNeeded.trim()) {
      toast.error("Parts needed is required.");
      return;
    }

    const payload: PartsRequest = {
      id: existingRequest?.id || uuidv4(),
      job_id: jobId,
      work_order_id: workOrderId,
      part_name: partsNeeded.trim(),
      urgency,
      quantity,
      notes: notes.trim() || null,
      requested_by,
      photo_urls: photoUrls,
      viewed_at: null,
      fulfilled_at: null,
      archived: existingRequest?.archived ?? false,
    };

    const { error } = existingRequest
      ? await supabase
          .from("parts_requests")
          .update(payload)
          .eq("id", existingRequest.id!)
      : await supabase.from("parts_requests").insert(payload);

    if (error) {
      toast.error("Failed to submit parts request: " + error.message);
    } else {
      toast.success(
        existingRequest ? "Request updated successfully." : "Parts request submitted."
      );
      resetForm();
      setTimeout(onClose, 600);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxFiles = 5 - photoUrls.length;
    const filesToUpload = Array.from(files).slice(0, maxFiles) as File[];

    setUploading(true);
    for (const file of filesToUpload) {
      const fileName = `${uuidv4()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("parts-request-photos")
        .upload(fileName, file);

      if (error) {
        toast.error(`Upload failed: ${file.name}`);
        continue;
      }

      const { data: publicData } = supabase.storage
        .from("parts-request-photos")
        .getPublicUrl(data!.path);

      const url = publicData?.publicUrl ?? "";
      if (url) setPhotoUrls((prev) => [...prev, url]);
    }
    setUploading(false);
  };

  const handleDeletePhoto = (url: string) => {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      /* Above FocusedJobModal (z-[100]/[110]) and ModalShell (z-[300]/[310]) */
      className="fixed inset-0 z-[320] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-[320] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Centered panel */}
      <div className="relative z-[330] mx-4 my-6 w-full">
        <Dialog.Panel className="w-full max-w-md rounded border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl">
          <Dialog.Title className="mb-4 font-header text-lg font-semibold tracking-wide">
            {existingRequest ? "Edit Parts Request" : "Request Parts"}
          </Dialog.Title>

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
              onChange={(e) => setQuantity(Number(e.target.value))}
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
            <label className="mb-1 block text-sm text-neutral-300">
              Photos ({photoUrls.length}/5)
            </label>
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
                    onClick={() => handleDeletePhoto(url)}
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