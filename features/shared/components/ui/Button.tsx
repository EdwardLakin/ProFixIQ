"use client";

import React from "react";
import clsx from "clsx";

type Variant =
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "outline"
  | "copper";

type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const base =
  "inline-flex items-center justify-center font-semibold transition duration-150 ease-in-out " +
  "backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-offset-2 " +
  "focus:ring-offset-black";

const variantClasses: Record<Exclude<Variant, "copper">, string> = {
  default: clsx(
    "text-[var(--theme-text-primary)]",
    "border border-[var(--theme-border-soft)]",
    "bg-[var(--theme-input-bg)]",
    "hover:bg-white/5",
  ),
  secondary: clsx(
    "text-[var(--theme-text-secondary)]",
    "border border-[var(--theme-border-strong)]",
    "bg-[color:var(--theme-panel-bg-start)]",
    "hover:bg-white/5",
  ),
  destructive: clsx(
    "text-white",
    "border border-red-500/50",
    "bg-red-700/60",
    "hover:bg-red-600/70",
  ),
  ghost: clsx(
    "text-[var(--theme-text-secondary)]",
    "border border-[var(--theme-border-soft)]",
    "bg-transparent",
    "hover:bg-white/5",
  ),
  outline: clsx(
    "text-[var(--theme-text-primary)]",
    "border border-[var(--theme-border-strong)]",
    "bg-transparent",
    "hover:bg-white/5",
  ),
};

const copperClass = clsx(
  "text-black",
  "bg-[var(--brand-primary)]",
  "hover:brightness-110",
  "border border-[color:var(--brand-primary)]/35",
  "shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary)_12%,transparent),0_0_16px_var(--theme-glow)]",
);

const sizeClasses: Record<Size, string> = {
  xs: "text-xs px-2 py-1 rounded-[var(--theme-radius-sm)]",
  sm: "text-sm px-3 py-1.5 rounded-[var(--theme-radius-md)]",
  md: "text-sm px-4 py-2 rounded-[var(--theme-radius-md)]",
  lg: "text-base px-5 py-3 rounded-[var(--theme-radius-lg)]",
};

export function buttonClasses({
  variant = "default",
  size = "md",
  className = "",
  disabled = false,
  isLoading = false,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const applied =
    variant === "copper"
      ? copperClass
      : variantClasses[variant as Exclude<Variant, "copper">];

  return clsx(
    base,
    applied,
    sizeClasses[size],
    "focus:ring-[var(--theme-ring)]",
    disabled || isLoading ? "cursor-not-allowed opacity-50" : "",
    className,
  );
}

export const Button = ({
  children,
  className = "",
  variant = "default",
  size = "md",
  isLoading = false,
  icon,
  iconRight,
  disabled,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={buttonClasses({
        variant,
        size,
        className,
        disabled,
        isLoading,
      })}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="mr-2 h-4 w-4 animate-spin text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}

      {!isLoading && icon && <span className="mr-2">{icon}</span>}
      <span>{children}</span>
      {!isLoading && iconRight && <span className="ml-2">{iconRight}</span>}
    </button>
  );
};
