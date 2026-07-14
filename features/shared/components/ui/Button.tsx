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
  "inline-flex items-center justify-center rounded-[var(--theme-radius-md,0.5rem)] font-semibold transition duration-150 ease-in-out " +
  "backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-offset-2 " +
  "focus:ring-[var(--desktop-focus-ring,var(--brand-primary,#C97A3D))] focus:ring-offset-[color:var(--theme-surface-page)]";

const variantClasses: Record<Exclude<Variant, "copper">, string> = {
  default: clsx(
    "border",
    "text-[var(--theme-surface-page)]",
    "border-[color:color-mix(in_srgb,var(--brand-primary,#C97A3D)_58%,#fbbf24)]",
    "bg-[linear-gradient(to_right,color-mix(in_srgb,var(--brand-primary,#C97A3D)_88%,var(--theme-text-primary)),color-mix(in_srgb,var(--brand-primary,#C97A3D)_60%,#f59e0b))]",
    "hover:brightness-105",
  ),
  secondary: clsx(
    "border",
    "text-[var(--theme-button-secondary-text,var(--theme-text-inverse))]",
    "border-[color:var(--desktop-border,var(--theme-card-border,var(--theme-border-soft)))]",
    "bg-[color:var(--theme-surface-inset)]",
    "hover:bg-[var(--theme-surface-inset)]",
  ),
  destructive: clsx(
    "text-[color:var(--theme-text-primary)]",
    "border border-red-500/50",
    "bg-red-700/60",
    "hover:bg-red-600/70",
  ),
  ghost: clsx(
    "border",
    "text-[var(--theme-text-primary,var(--theme-text-inverse))]",
    "border-[color:var(--desktop-border,var(--theme-card-border,var(--theme-border-soft)))]",
    "bg-transparent hover:bg-[color:var(--theme-surface-subtle)]",
  ),
  outline: clsx(
    "border",
    "text-[var(--theme-text-primary,var(--theme-text-inverse))]",
    "border-[color:var(--desktop-border,var(--theme-card-border,var(--theme-border-soft)))]",
    "bg-transparent",
    "hover:bg-[color:var(--theme-surface-subtle)]",
  ),
};

const copperClass = clsx(
  "border",
  "text-[var(--theme-surface-page)]",
  "bg-[linear-gradient(to_right,color-mix(in_srgb,var(--brand-primary,#C97A3D)_88%,var(--theme-text-primary)),color-mix(in_srgb,var(--brand-primary,#C97A3D)_60%,#f59e0b))]",
  "border-[color:color-mix(in_srgb,var(--brand-primary,#C97A3D)_58%,#fbbf24)]",
  "hover:brightness-105",
  "shadow-[var(--theme-shadow-soft,0_0_0_1px_rgba(193,102,59,0.12),0_0_16px_rgba(193,102,59,0.18))]",
);

const sizeClasses: Record<Size, string> = {
  xs: "text-xs px-2 py-1",
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-3",
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
