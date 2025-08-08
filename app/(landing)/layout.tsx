import "./globals.css";
import type { Metadata } from "next";
import Providers from "../providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ProFixIQ",
  description: "AI-powered vehicle diagnostics and repair assistant",
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
        className="bg-gradient-to-br from-black via-neutral-900 to-[#1a1a1a] text-white font-header"
      >
        <Providers>
          <Toaster position="top-center" />
          {children}
        </Providers>
      </body>
    </html>
  );
}
