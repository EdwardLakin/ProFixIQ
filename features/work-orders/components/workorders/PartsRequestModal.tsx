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
        existingRequest ? "Request updated successfully." : "Parts request submitted."
      );
      resetForm();
      setTimeout(onClose, 1000);
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = e.target as HTMLInputElement | null;
    const files = input?.files;
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
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded bg-neutral-900 p-6 text-white shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-bold">
            {existingRequest ? "Edit Parts Request" : "Request Parts"}
          </Dialog.Title>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Parts Needed*</label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-600 bg-neutral-800 p-2"
              value={partsNeeded}
              onChange={(e) => setPartsNeeded(e.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Quantity</label>
            <input
              type="number"
              className="w-full rounded border border-neutral-600 bg-neutral-800 p-2"
              value={quantity}
              min={1}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Urgency</label>
            <select
              className="w-full rounded border border-neutral-600 bg-neutral-800 p-2"
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
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-600 bg-neutral-800 p-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">
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
                  <img
                    src={url}
                    alt="part"
                    className="h-16 w-16 rounded object-cover"
                  />
                  <button
                    onClick={() => handleDeletePhoto(url)}
                    className="absolute right-0 top-0 rounded bg-red-600 px-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="rounded bg-orange-500 px-4 py-2 font-semibold hover:bg-orange-600"
            >
              {existingRequest ? "Update Request" : "Submit Request"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}