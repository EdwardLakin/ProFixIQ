import Link from "next/link";
import { ProFixIQMark, ProFixIQWordmark } from "@shared/components/brand/ProFixIQBrand";

export default function ResourceHeader() {
  return (
    <header className="border-b border-[color:var(--marketing-border)] bg-[rgba(247,249,252,0.94)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="ProFixIQ home">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#07111f]">
            <ProFixIQMark className="h-7 w-7" />
          </span>
          <ProFixIQWordmark className="hidden text-lg text-[color:var(--marketing-ink)] sm:block" />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Resources navigation">
          <Link href="/#product" className="text-sm font-semibold text-[color:var(--marketing-muted)] hover:text-[color:var(--marketing-ink)]">Product</Link>
          <Link href="/#pricing" className="text-sm font-semibold text-[color:var(--marketing-muted)] hover:text-[color:var(--marketing-ink)]">Pricing</Link>
          <Link href="/resources" className="text-sm font-bold text-[color:var(--marketing-ink)]">Resources</Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/request-demo" className="hidden rounded-xl border border-[color:var(--marketing-border-strong)] bg-white px-4 py-2.5 text-sm font-bold sm:inline-flex">Request demo</Link>
          <Link href="/compare-plans" className="rounded-xl bg-[color:var(--marketing-copper)] px-4 py-2.5 text-sm font-bold text-white">Start free trial</Link>
        </div>
      </div>
    </header>
  );
}
