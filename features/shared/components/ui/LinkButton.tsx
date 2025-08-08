"use client";

import Link from "next/link";
import { clsx } from "clsx";
import React from "react";

type Variant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface LinkButtonProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
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

export const LinkButton = ({
  href,
  children,
  className = "",
  variant = "default",
  size = "md",
  icon,
  iconRight,
  ...props
}: LinkButtonProps) => {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center rounded font-semibold transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500",
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
};
