// components/inspection/PhotoPreview.tsx

import React from 'react';

interface PhotoPreviewProps {
  photoUrls?: string[];
}

const PhotoPreview: React.FC<PhotoPreviewProps> = ({ photoUrls }) => {
  if (!photoUrls || photoUrls.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap mt-2">
      {photoUrls.map((url, index) => (
        <img
          key={index}
          src={url}
          alt={`Photo ${index + 1}`}
          className="w-16 h-16 object-cover rounded border border-gray-500"
        />
      ))}
    </div>
  );
};

export default PhotoPreview;