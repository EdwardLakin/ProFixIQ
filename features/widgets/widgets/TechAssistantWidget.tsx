"use client";
import Link from "next/link";

export function TechAssistantWidget({
  route,
  size,
  data,
}: {
  route: string;
  size: "1x1" | "2x1" | "2x2";
  data: { tips: string[] };
}) {
  const tips = data.tips.slice(0, size === "2x2" ? 5 : size === "2x1" ? 4 : 3);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Tech Assistant</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      <ul className="space-y-1 text-xs">
        {tips.map((t, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="truncate">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
