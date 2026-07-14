"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";

type VehiclePhoto = Database["public"]["Tables"]["vehicle_photos"]["Row"];

interface Props {
  vehicleId: string;
  onUpload?: (photo: VehiclePhoto) => void;
}

export default function VehiclePhotoUploader({ vehicleId, onUpload }: Props) {
  const supabase = createBrowserSupabase();

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
    <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Upload vehicle photo
          </h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
            Attach walkaround or damage documentation to this vehicle.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* file input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Image file
          </label>
          <label className="inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-[12px] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] hover:border-[var(--accent-copper-light)] hover:bg-[color:var(--theme-surface-overlay)]">
            <span className="truncate">
              {file ? file.name : "Choose image…"}
            </span>
            <span className="rounded-full bg-[var(--accent-copper)]/90 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--theme-text-on-accent)]">
              Browse
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="text-[10px] text-[color:var(--theme-text-muted)]">
            JPG / PNG recommended. Large images may take a moment to upload.
          </p>
        </div>

        {/* caption input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Caption
          </label>
          <input
            type="text"
            placeholder="e.g. Front right bumper damage, before repair"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-9 w-full rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-[13px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        {/* action */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent-copper)] px-4 py-1.5 text-sm font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_24px_rgba(248,113,22,0.55)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      </div>
    </div>
  );
}