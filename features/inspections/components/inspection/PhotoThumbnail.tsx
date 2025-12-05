"use client";



interface PhotoThumbnailProps {
  url: string;
  onRemove?: () => void;
}

const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ url, onRemove }) => {
  return (
    <div className="relative w-24 h-24 m-1 rounded overflow-hidden border border-gray-600 shadow">
      <img
        src={url}
        alt="Inspection"
        className="object-cover w-full h-full rounded"
      />
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-0 right-0 bg-red-600 text-white rounded-bl px-1 text-xs hover:bg-red-700"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default PhotoThumbnail;
