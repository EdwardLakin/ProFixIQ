// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Roboto, Black_Ops_One } from "next/font/google";
import AppShell from "@/features/shared/components/AppShell";

export const metadata: Metadata = {
  title: "ProFixIQ",
  description: "Tech-forward automotive workflow",
};

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${blackOps.variable} font-sans bg-background text-white`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}