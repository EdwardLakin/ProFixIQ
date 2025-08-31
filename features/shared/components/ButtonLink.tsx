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
        "inline-flex items-center justify-center rounded-lg px-4 py-2",
        "bg-surface text-accent shadow-card hover:shadow-lg transition",
        "border border-neutral-800/20 dark:border-neutral-200/10",
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
