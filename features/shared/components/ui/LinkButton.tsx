"use client";

import Link from "next/link";
import clsx from "clsx";

type Variant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  default:
    "text-white border border-white/10 bg-black/30 hover:bg-white/5",
  secondary:
    "text-neutral-200 border border-white/15 bg-black/20 hover:bg-white/5",
  destructive:
    "text-white border border-red-500/50 bg-red-700/60 hover:bg-red-600/70",
  ghost:
    "text-neutral-200 border border-white/10 bg-transparent hover:bg-white/5",
  outline:
    "text-[color:var(--accent-copper-light,#fdba74)] border border-[color:var(--accent-copper-soft,#fdba74)] bg-transparent hover:bg-[color:var(--accent-copper,#f97316)]/10",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-base px-4 py-2",
  lg: "text-lg px-5 py-3",
};

function LinkButton({
  href,
  children,
  className = "",
  variant = "default",
  size = "md",
  icon,
  iconRight,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-semibold transition duration-150 ease-in-out",
        "backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.45)] focus:ring-offset-2 focus:ring-offset-black",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span className="ml-2">{iconRight}</span>}
    </Link>
  );
}

export default LinkButton;
export type { LinkButtonProps, Variant, Size };
