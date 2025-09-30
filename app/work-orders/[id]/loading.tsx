export default function Loading() {
  return (
    <div className="p-6">
      <div className="h-6 w-40 animate-pulse rounded bg-neutral-800/60" />
      <div className="mt-4 grid gap-3">
        <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
        <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
      </div>
    </div>
  );
}
