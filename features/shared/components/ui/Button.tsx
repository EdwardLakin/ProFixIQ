// @shared/components/ui/Button.tsx
"use client";

import React from "react";
import clsx from "clsx";

type Variant =
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "outline"
  | "orange";
type Size = "sm" | "md" | "lg";

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const base =
  "inline-flex items-center justify-center rounded font-semibold transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 backdrop-blur-sm";

// glassy variants – all white text, orange-ish borders
const variantClasses: Record<Exclude<Variant, "orange">, string> = {
  default:
    "bg-black/30 border border-orange-400/80 text-white hover:bg-orange-500/10",
  secondary:
    "bg-black/20 border border-orange-400/60 text-white hover:bg-orange-500/10",
  destructive:
    "bg-red-700/80 border border-red-400 text-white hover:bg-red-600",
  ghost:
    "bg-transparent border border-orange-400/50 text-white hover:bg-orange-500/10",
  outline:
    "bg-transparent border border-orange-400 text-white hover:bg-orange-500/10",
};

// optional filled orange accent if you still want it elsewhere
const orangeClass =
  "bg-orange-500/90 hover:bg-orange-500 text-black border border-orange-400/80";

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
  const sizeClasses: Record<Size, string> = {
    sm: "text-sm px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-3",
  };

  const applied =
    variant === "orange"
      ? orangeClass
      : variantClasses[variant as Exclude<Variant, "orange">];

  return clsx(
    base,
    applied,
    sizeClasses[size],
    disabled || isLoading ? "opacity-50 cursor-not-allowed" : "",
    className
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