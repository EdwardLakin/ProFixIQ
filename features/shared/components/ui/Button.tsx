"use client";

import React from "react";
import clsx from "clsx";

/* -------------------------------------------------------------------------- */
/*  THEME TOKENS — adjust these in one place if you tweak color later         */
/* -------------------------------------------------------------------------- */

const COPPER = "rgb(184 115 51)"; // burnt copper hex: #B87333
const COPPER_HOVER = "rgb(168 105 45)";
const COPPER_SOFT = "rgba(184, 115, 51, 0.55)";
const COPPER_FAINT = "rgba(184, 115, 51, 0.28)";
const METAL_BORDER = "rgba(255,255,255,0.10)";
const METAL_BORDER_STRONG = "rgba(255,255,255,0.18)";
const GLASS_BG = "rgba(0,0,0,0.30)"; // dark glass background

type Variant =
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "outline"
  | "copper"; // new instead of "orange"

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

/* -------------------------------------------------------------------------- */
/*  Base styling                                                              */
/* -------------------------------------------------------------------------- */

const base =
  "inline-flex items-center justify-center rounded-md font-semibold transition duration-150 " +
  "ease-in-out backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-offset-2 " +
  "focus:ring-[rgba(184,115,51,0.45)] focus:ring-offset-black";

/* -------------------------------------------------------------------------- */
/*  Metallic / Glass Variants                                                 */
/* -------------------------------------------------------------------------- */

const variantClasses: Record<Exclude<Variant, "copper">, string> = {
  /** Glass default */
  default: clsx(
    "text-white",
    "border",
    "border-[--metal-border]", // resolved via CSS var
    "bg-[--glass-bg]",
    "hover:bg-[rgba(255,255,255,0.05)]",
  ),

  /** Slightly dimmer glass */
  secondary: clsx(
    "text-neutral-200",
    "border border-[--metal-border-strong]",
    "bg-[rgba(0,0,0,0.22)]",
    "hover:bg-[rgba(255,255,255,0.06)]",
  ),

  /** Strong red destructive */
  destructive: clsx(
    "text-white",
    "border border-red-500/50",
    "bg-red-700/60",
    "hover:bg-red-600/70",
  ),

  /** Transparent ghost */
  ghost: clsx(
    "text-neutral-200",
    "border border-[--metal-border]",
    "bg-transparent",
    "hover:bg-[rgba(255,255,255,0.05)]",
  ),

  /** Outline-only metallic border */
  outline: clsx(
    "text-white",
    "border border-[--metal-border-strong]",
    "bg-transparent",
    "hover:bg-[rgba(255,255,255,0.06)]",
  ),
};

/* -------------------------------------------------------------------------- */
/*  COPPER ACCENT VARIANT                                                     */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 * Tailwind can't compile runtime template strings like `bg-[${COPPER}]`.
 * So we use CSS variables and static class strings instead.
 */
const copperClass = clsx(
  "text-black",
  "bg-[--copper]",
  "hover:bg-[--copper-hover]",
  "border border-[--copper-soft]",
  "shadow-[0_0_0_1px_var(--copper-faint),0_0_12px_var(--copper-faint)]",
);

/* -------------------------------------------------------------------------- */
/*  Sizing                                                                    */
/* -------------------------------------------------------------------------- */

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
    // theme variables (now also include copper + hover + soft/faint)
    {
      "--metal-border": METAL_BORDER,
      "--metal-border-strong": METAL_BORDER_STRONG,
      "--glass-bg": GLASS_BG,
      "--copper": COPPER,
      "--copper-hover": COPPER_HOVER,
      "--copper-soft": COPPER_SOFT,
      "--copper-faint": COPPER_FAINT,
    } as React.CSSProperties,
    base,
    applied,
    sizeClasses[size],
    disabled || isLoading ? "opacity-50 cursor-not-allowed" : "",
    className,
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

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
          className="mr-2 h-4 w-4 animate-spin text-white"
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