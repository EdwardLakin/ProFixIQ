export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TechAssistantPage() {
  return (
    <div className="mx-auto max-w-[720px] p-4">
      <h1 className="mb-4 text-2xl font-semibold">Tech Assistant</h1>
      <p className="mb-4 text-white/80">
        Ask questions about diagnostics, repair procedures, parts, or workflows.
      </p>
      <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
        <div className="mb-2 text-sm text-white/70">Quick prompts</div>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li className="rounded-lg bg-white/10 px-3 py-1">Diagnose brake noise</li>
          <li className="rounded-lg bg-white/10 px-3 py-1">Torque specs for F-150</li>
          <li className="rounded-lg bg-white/10 px-3 py-1">Recall check by VIN</li>
        </ul>
      </div>
    </div>
  );
}
