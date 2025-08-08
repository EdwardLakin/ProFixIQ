"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";
import { stringFromBase64URL } from "@supabase/ssr";

type PartsRequest = Database["public"]["Tables"]["parts_requests"]["Insert"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  workOrderId: string;
  requested_by: string;
  existingRequest?: Partial<PartsRequest> | null;
}

export default function PartsRequestModal({
  isOpen,
  onClose,
  jobId,
  workOrderId,
  requested_by,
  existingRequest = null,
}: Props) {
  const supabase = createBrowserSupabase();

  const [partsNeeded, setPartsNeeded] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (existingRequest) {
      setPartsNeeded(existingRequest.part_name || "");
      setUrgency(existingRequest.urgency as "low" | "medium" | "high");
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
    if (!partsNeeded) {
      toast.error("Parts needed is required.");
      return;
    }

    const payload: PartsRequest = {
      id: existingRequest?.id || uuidv4(),
      job_id: jobId,
      work_order_id: workOrderId,
      part_name: partsNeeded,
      urgency,
      quantity,
      notes,
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
        existingRequest
          ? "Request updated successfully."
          : "Parts request submitted.",
      );
      resetForm();
      setTimeout(onClose, 1500);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    const maxFiles = 5 - photoUrls.length;
    const filesToUpload = Array.from(files).slice(0, maxFiles);

    setUploading(true);
    for (const file of filesToUpload) {
      const fileName = `${uuidv4()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("parts-request-photos")
        .upload(fileName, file);

      if (error) {
        toast.error(`Upload failed: ${file.name}`);
      } else {
        const url = supabase.storage
          .from("parts-request-photos")
          .getPublicUrl(fileName).data.publicUrl;
        setPhotoUrls((prev) => [...prev, url]);
      }
    }
    setUploading(false);
  };

  const handleDeletePhoto = (url: string) => {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded bg-neutral-900 p-6 text-white shadow-lg">
          <Dialog.Title className="text-lg font-bold mb-4">
            {existingRequest ? "Edit Parts Request" : "Request Parts"}
          </Dialog.Title>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Parts Needed*
            </label>
            <textarea
              rows={2}
              className="w-full rounded bg-neutral-800 border border-neutral-600 p-2"
              value={partsNeeded}
              onChange={(e) => setPartsNeeded(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="number"
              className="w-full rounded bg-neutral-800 border border-neutral-600 p-2"
              value={quantity}
              min={1}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Urgency</label>
            <select
              className="w-full rounded bg-neutral-800 border border-neutral-600 p-2"
              value={urgency}
              onChange={(e) =>
                setUrgency(e.target.value as "low" | "medium" | "high")
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded bg-neutral-800 border border-neutral-600 p-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Photos ({photoUrls.length}/5)
            </label>
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={photoUrls.length >= 5 || uploading}
              onChange={handlePhotoUpload}
              className="mb-2"
            />
            <div className="flex flex-wrap gap-2">
              {photoUrls.map((url) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt="part"
                    className="h-16 w-16 rounded object-cover"
                  />
                  <button
                    onClick={() => handleDeletePhoto(url)}
                    className="absolute top-0 right-0 bg-red-600 text-xs rounded px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded font-semibold"
            >
              {existingRequest ? "Update Request" : "Submit Request"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}