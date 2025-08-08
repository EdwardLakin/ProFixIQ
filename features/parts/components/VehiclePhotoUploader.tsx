"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/supabase";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

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
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `${vehicleId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vehicle-photos")
      .upload(filePath, file);

    if (uploadError) {
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

    const { data: inserted, error: insertError } = await supabase
      .from("vehicle_photos")
      .insert({
        vehicle_id: vehicleId,
        uploaded_by: user.id,
        url: publicUrl,
        caption,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      toast.error("Failed to save photo info");
      setUploading(false);
      return;
    }

    toast.success("Photo uploaded");
    if (onUpload) onUpload(inserted);
    setFile(null);
    setCaption("");
    setUploading(false);
  };

  return (
    <div className="bg-neutral-800 p-4 rounded-lg border border-neutral-700 space-y-4">
      <h3 className="text-white font-semibold text-lg">Upload Vehicle Photo</h3>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="text-white"
      />

      <input
        type="text"
        placeholder="Enter caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="w-full p-2 rounded bg-neutral-700 border border-neutral-600 text-white"
      />

      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload Photo"}
      </button>
    </div>
  );
}
