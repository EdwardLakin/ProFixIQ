import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export default function AuthStatus({
  tone,
  children,
}: {
  tone: "error" | "success" | "neutral";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  const colors =
    tone === "error"
      ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200"
      : tone === "success"
        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]";

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${colors}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
