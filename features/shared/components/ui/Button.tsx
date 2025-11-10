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
  "inline-flex items-center justify-center rounded font-semibold transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500";

const variantClasses: Record<
  Exclude<Variant, "orange">,
  string
> = {
  // calmer default
  default: "bg-zinc-800 hover:bg-zinc-700 text-white",
  secondary: "bg-zinc-700 hover:bg-zinc-600 text-white",
  destructive: "bg-red-600 hover:bg-red-700 text-white",
  ghost: "bg-transparent hover:bg-zinc-800 text-white border border-zinc-600",
  // your “not so bright” orange
  outline:
    "bg-transparent border border-orange-500/80 text-orange-300 hover:bg-orange-500/10",
};

// small helper so we can reuse on <Link> etc.
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

  // light orange fill version (optional)
  const orangeClass =
    "bg-orange-500/90 hover:bg-orange-500 text-black border border-orange-400/80";

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
          className="animate-spin h-4 w-4 mr-2 text-white"
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