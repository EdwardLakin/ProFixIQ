"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";

type VehiclePhoto = Database["public"]["Tables"]["vehicle_photos"]["Row"];

interface Props {
  vehicleId: string;
  onUpload?: (photo: VehiclePhoto) => void;
}

export default function VehiclePhotoUploader({ vehicleId, onUpload }: Props) {
  const supabase = createClientComponentClient<Database>();

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("User not authenticated");
      setUploading(false);
      return;
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${uuidv4()}.${fileExt || "jpg"}`;
    const filePath = `${vehicleId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vehicle-photos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Vehicle photo upload failed", uploadError);
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("vehicle-photos")
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      toast.error("Could not get image URL");
      setUploading(false);
      return;
    }

    const trimmedCaption = caption.trim();

    const { data: inserted, error: insertError } = await supabase
      .from("vehicle_photos")
      .insert({
        vehicle_id: vehicleId,
        uploaded_by: user.id,
        url: publicUrl,
        caption: trimmedCaption || null,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("Failed to save vehicle photo row", insertError);
      toast.error("Failed to save photo info");
      setUploading(false);
      return;
    }

    toast.success("Photo uploaded");
    onUpload?.(inserted);
    setFile(null);
    setCaption("");
    setUploading(false);
  };

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-[0_0_40px_rgba(0,0,0,0.85)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">
            Upload vehicle photo
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Attach walkaround or damage documentation to this vehicle.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* file input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Image file
          </label>
          <label className="inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[12px] text-neutral-200 shadow-[0_0_18px_rgba(0,0,0,0.9)] hover:border-[var(--accent-copper-light)] hover:bg-black/60">
            <span className="truncate">
              {file ? file.name : "Choose image…"}
            </span>
            <span className="rounded-full bg-[var(--accent-copper)]/90 px-2 py-0.5 text-[11px] font-semibold text-black">
              Browse
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            JPG / PNG recommended. Large images may take a moment to upload.
          </p>
        </div>

        {/* caption input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Caption
          </label>
          <input
            type="text"
            placeholder="e.g. Front right bumper damage, before repair"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-9 w-full rounded-full border border-white/15 bg-black/40 px-3 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        {/* action */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent-copper)] px-4 py-1.5 text-sm font-semibold text-black shadow-[0_0_24px_rgba(248,113,22,0.55)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      </div>
    </div>
  );
}