"use client";
export default function Features() {
  const items = [
    { title: "Phone-style Dashboard", body: "App icons, dock, badges, and widgets—just like a phone." },
    { title: "Work Order Automation", body: "Create, quote, and track with less typing and fewer clicks." },
    { title: "Inspections that Fly", body: "Fast checklists, photos, and shareable summaries." },
    { title: "Smart Parts Flow", body: "Inventory, returns, warranties—at a glance." },
    { title: "Live Messaging", body: "Conversations with unread badges and quick jump-ins." },
    { title: "Owner KPIs", body: "Revenue, cycle time, job count—right on the home." },
  ];

  return (
    <section id="features" className="px-safe py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-center text-2xl font-semibold sm:text-3xl">Built for busy shops</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-1 text-base font-semibold">{f.title}</div>
              <p className="text-sm text-white/70">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
