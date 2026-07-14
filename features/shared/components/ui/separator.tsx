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
          ? `h-full w-px bg-[color:var(--theme-surface-subtle)] ${className || ""}`
          : `h-px w-full bg-[color:var(--theme-surface-subtle)] ${className || ""}`
      }
    />
  );
}
