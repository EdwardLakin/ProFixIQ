export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      className={
        orientation === "vertical"
          ? `w-px h-full bg-white/10 ${className || ""}`
          : `h-px w-full bg-white/10 ${className || ""}`
      }
    />
  );
}