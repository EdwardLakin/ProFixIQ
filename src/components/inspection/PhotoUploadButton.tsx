// src/components/inspection/PhotoUploadButton.tsx
import React from 'react';

interface PhotoUploadButtonProps {
  onUpload: (url: string) => void;
}

const PhotoUploadButton: React.FC<PhotoUploadButtonProps> = ({ onUpload }) => {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Fake upload for now, replace with actual Supabase/Cloudinary/etc. logic
    const url = URL.createObjectURL(file);
    onUpload(url);
  };

  return (
    <div className="mt-2">
      <label className="text-sm text-orange-400 font-semibold cursor-pointer">
        📸 Add Photo
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </label>
    </div>
  );
};

export default PhotoUploadButton;