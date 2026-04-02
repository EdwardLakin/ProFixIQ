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
          ? `h-full w-px bg-white/10 ${className || ""}`
          : `h-px w-full bg-white/10 ${className || ""}`
      }
    />
  );
}
