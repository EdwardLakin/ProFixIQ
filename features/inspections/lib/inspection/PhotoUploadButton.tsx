"use client";

import { useState } from "react";
import PhotoThumbnail from "@shared/components/inspection/PhotoThumbnail";

interface PhotoUploadButtonProps {
  photoUrls: string[];
  onChange: (urls: string[]) => void;
}

export default function PhotoUploadButton({
  photoUrls,
  onChange,
}: PhotoUploadButtonProps) {
  const [urls, setUrls] = useState<string[]>(photoUrls || []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newUrls: string[] = [];

    for (const file of files) {
      const url = URL.createObjectURL(file); // use a real upload if needed
      newUrls.push(url);
    }

    const updatedUrls = [...urls, ...newUrls];
    setUrls(updatedUrls);
    onChange(updatedUrls);
  };

  const handleRemove = (index: number) => {
    const updated = urls.filter((_, i) => i !== index);
    setUrls(updated);
    onChange(updated);
  };

  return (
    <div className="mt-2">
      <label className="text-xs text-white font-bold block mb-1">
        Upload Photos
      </label>
      <div className="flex flex-wrap">
        {urls.map((url, i) => (
          <PhotoThumbnail
            key={url + i}
            url={url}
            onRemove={() => handleRemove(i)}
          />
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
