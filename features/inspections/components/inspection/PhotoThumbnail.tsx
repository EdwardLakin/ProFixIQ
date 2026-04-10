//features/inspections/components/inspection/PhotoThumbnail.tsx

"use client";

interface PhotoThumbnailProps {
  url: string;
  onRemove?: () => void;
}

const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ url, onRemove }) => {
  return (
    <div className="group relative m-1 w-28 overflow-hidden rounded-xl border border-white/15 bg-black/45 shadow-[0_10px_25px_rgba(0,0,0,0.45)]">
      <img
        src={url}
        alt="Inspection evidence"
        className="h-24 w-full object-cover transition duration-200 group-hover:scale-[1.02]"
      />
      <div className="border-t border-white/10 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-neutral-300">
        Evidence photo
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute right-1 top-1 rounded-md border border-red-400/40 bg-black/70 px-1.5 py-0.5 text-[10px] text-red-100 hover:bg-red-500/25"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default PhotoThumbnail;
