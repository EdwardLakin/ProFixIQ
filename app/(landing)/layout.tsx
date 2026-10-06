import "./globals.css";
import type { Metadata } from "next";
import Providers from "../providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
  description:
    "Heavy-duty and automotive repair shop software for voice inspections, technician-built repairs, parts workflows, approvals, field service, and fleet maintenance.",
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        id="root"
        className="var(--theme-gradient-panel)"
      >
        <Providers initialSession={null}>
          <Toaster position="top-center" />
          {children}
        </Providers>
      </body>
    </html>
  );
}