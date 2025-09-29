// features/launcher/components/AvatarCircle.tsx
export default function AvatarCircle({ label }: { label: string }) {
  // make initials from label
  const parts = label.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : label.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
      {initials}
    </div>
  );
}