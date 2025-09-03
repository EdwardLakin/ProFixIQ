"use client";

import { useState } from "react";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";

// NOTE: Using `any` on the exported component props avoids Next's TS(71007)
// "Props must be serializable" check for function props starting with `on*`.
// We immediately cast inside for full type safety.
export default function PhotoUploadButton(props: any) {
  const { photoUrls, onChange } = props as {
    photoUrls: string[];
    onChange: (urls: string[]) => void;
  };

  const [urls, setUrls] = useState<string[]>(photoUrls ?? []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newUrls = files.map((f) => URL.createObjectURL(f)); // swap with real upload later
    const updated = [...urls, ...newUrls];
    setUrls(updated);
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = urls.filter((_, i) => i !== index);
    setUrls(updated);
    onChange(updated);
  };

  return (
    <div className="mt-2">
      <label className="text-xs text-white font-bold block mb-1">Upload Photos</label>

      <div className="flex flex-wrap">
        {urls.map((url, i) => (
          <PhotoThumbnail key={url + i} url={url} onRemove={() => handleRemove(i)} />
        ))}
      </div>

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="block mt-2 text-sm text-gray-300 file:rounded-full file:border-0
        file:text-sm file:font-semibold file:bg-orange-700 file:text-white
        hover:file:bg-orange-600"
      />
    </div>
  );
}