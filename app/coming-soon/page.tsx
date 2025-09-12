// app/coming-soon/page.tsx
export const dynamic = "force-static";

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center space-y-6 px-6">
        <h1 className="font-header text-4xl text-accent">🚧 Coming Soon 🚧</h1>
        <p className="text-neutral-300">
          ProFixIQ is under active development. Please check back soon.
        </p>
      </div>
    </main>
  );
}