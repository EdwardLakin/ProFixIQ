import Link from "next/link";

export default function WorkforceRelocationNotice({ href }: { href: string }) {
  return (
    <div className="mb-4 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
      Day-to-day workforce operations now live in the Workforce module. {" "}
      <Link className="font-medium text-orange-300 underline hover:text-orange-200" href={href}>
        Open Workforce view
      </Link>
      .
    </div>
  );
}
