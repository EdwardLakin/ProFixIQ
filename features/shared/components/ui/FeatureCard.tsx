"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@shared/lib/utils";

type BaseProps = {
  title: string;
  className?: string;
  available?: boolean;
};

type WithDescription = BaseProps & {
  description: string;
  content?: never;
  subtitle?: never;
};

type WithContent = BaseProps & {
  content: string;
  subtitle?: string;
  description?: never;
};

type FeatureCardProps = WithDescription | WithContent;

function getBodyText(props: FeatureCardProps): string {
  // ✅ TS-safe: handle any accidental optional/undefined drift
  if ("content" in props && typeof props.content === "string" && props.content.trim()) {
    return props.content;
  }
  if ("description" in props && typeof props.description === "string") {
    return props.description;
  }
  return "";
}

function getSubtitle(props: FeatureCardProps): string | null {
  if ("subtitle" in props && typeof props.subtitle === "string" && props.subtitle.trim()) {
    return props.subtitle;
  }
  return null;
}

export default function FeatureCard(props: FeatureCardProps) {
  const { title, className, available } = props;

  const bodyText = getBodyText(props);
  const subtitle = getSubtitle(props);

  const status =
    available === undefined ? "default" : available ? "available" : "locked";

  const StatusIcon =
    status === "available" ? CheckCircle2 : status === "locked" ? Lock : null;

  const statusLabel =
    status === "available" ? "Available" : status === "locked" ? "Locked" : null;

  const statusPillStyle: React.CSSProperties =
    status === "available"
      ? {
          borderColor: "rgba(16,185,129,0.35)",
          backgroundColor: "rgba(16,185,129,0.12)",
          color: "rgba(167,243,208,0.95)",
        }
      : status === "locked"
      ? {
          borderColor: "rgba(248,113,113,0.35)",
          backgroundColor: "rgba(248,113,113,0.10)",
          color: "rgba(254,202,202,0.95)",
        }
      : {
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(0,0,0,0.25)",
          color: "rgba(226,232,240,0.75)",
        };

  return (
    <article
      aria-label={title}
      className={cn(
        "group relative overflow-hidden rounded-3xl border p-5",
        "bg-black/30 backdrop-blur-xl",
        "transition-transform duration-200 hover:-translate-y-[2px]",
        "shadow-[0_18px_45px_rgba(0,0,0,0.65)]",
        className,
      )}
      style={{
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      {/* sheen + copper edge glow */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(0,0,0,0.55))",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.0) 1px, rgba(0,0,0,0.20) 2px)",
          }}
        />
        <div
          className="absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl opacity-0 transition-opacity duration-200 group-hover:opacity-40"
          style={{ backgroundColor: "rgba(193, 102, 59, 0.28)" }}
        />
        <div
          className="absolute -left-28 -bottom-28 h-64 w-64 rounded-full blur-3xl opacity-0 transition-opacity duration-200 group-hover:opacity-25"
          style={{ backgroundColor: "rgba(227, 154, 110, 0.18)" }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          boxShadow: "0 0 0 1px rgba(193,102,59,0.20) inset",
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {StatusIcon ? (
              <StatusIcon
                className={cn(
                  "h-5 w-5 shrink-0",
                  status === "available"
                    ? "text-emerald-300"
                    : status === "locked"
                    ? "text-red-300"
                    : "text-neutral-300",
                )}
                aria-hidden
              />
            ) : (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: "var(--accent-copper)" }}
                aria-hidden
              />
            )}

            <h3 className="truncate text-lg font-blackops text-white">{title}</h3>
          </div>

          {subtitle ? (
            <p
              className="mt-1 text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "rgba(227, 154, 110, 0.85)" }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        <span
          className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold"
          style={statusPillStyle}
        >
          {statusLabel ?? "ProFixIQ"}
        </span>
      </div>

      <p className="relative mt-3 text-sm leading-relaxed text-neutral-300">
        {bodyText}
      </p>

      <div className="relative mt-4 flex items-center gap-2">
        <div
          className="h-[2px] w-10 rounded-full"
          style={{ backgroundColor: "var(--accent-copper)" }}
        />
        <div className="h-px flex-1 bg-white/5" />
      </div>
    </article>
  );
}