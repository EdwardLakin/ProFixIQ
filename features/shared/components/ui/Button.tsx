"use client";

import React from "react";
import { clsx } from "clsx";

type Variant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-orange-600 hover:bg-orange-700 text-white",
  secondary: "bg-zinc-700 hover:bg-zinc-600 text-white",
  destructive: "bg-red-600 hover:bg-red-700 text-white",
  ghost: "bg-transparent hover:bg-zinc-800 text-white border border-zinc-600",
  outline:
    "bg-transparent border border-orange-500 text-orange-400 hover:bg-orange-500 hover:text-white",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-base px-4 py-2",
  lg: "text-lg px-5 py-3",
};

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
      className={clsx(
        "inline-flex items-center justify-center rounded font-semibold transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500",
        variantClasses[variant],
        sizeClasses[size],
        disabled || isLoading ? "opacity-50 cursor-not-allowed" : "",
        className,
      )}
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
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          ></path>
        </svg>
      )}
      {!isLoading && icon && <span className="mr-2">{icon}</span>}
      <span>{children}</span>
      {!isLoading && iconRight && <span className="ml-2">{iconRight}</span>}
    </button>
  );
};
