"use client";
import Link from "next/link";

type Props = {
  href: string;
  children: React.ReactNode;
  className?: string;
  prefetch?: boolean;
};

export default function ButtonLink({ href, children, className = "", prefetch = true }: Props) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={[
        "desktop-btn-secondary inline-flex items-center justify-center rounded-lg border px-4 py-2",
        "text-sm font-medium text-[var(--theme-text-primary)] transition",
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
