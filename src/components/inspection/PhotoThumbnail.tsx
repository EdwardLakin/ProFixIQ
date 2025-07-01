// components/inspection/PhotoThumbnail.tsx

interface PhotoThumbnailProps {
  url: string;
  alt?: string;
}

const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ url, alt }) => {
  return (
    <div className="mt-2">
      <img
        src={url}
        alt={alt || 'Inspection photo'}
        className="w-24 h-24 object-cover rounded shadow-md border border-gray-700"
      />
    </div>
  );
};

export default PhotoThumbnail;