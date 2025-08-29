"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PortalHome() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Welcome to your portal</h1>
      <p>Track work orders, manage vehicles, and book your next appointment.</p>
    </div>
  );
}