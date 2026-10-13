import "./globals.css";
import type { Metadata } from "next";
import Providers from "../providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ProFixIQ | Heavy-Duty Repair Shop Software",
  description:
    "Heavy-duty repair shop software for diesel and commercial vehicle operations, with voice inspections, technician-built repairs, parts workflows, approvals, field service, fleet maintenance, and automotive support.",
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