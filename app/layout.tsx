// app/layout.tsx
import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Link from "next/link";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${blackOps.variable} ${inter.className} bg-black text-white`}>
        <Providers>
          {/* Site navbar (simple) */}
          <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="tracking-wide font-blackops text-orange-400">
                ProFixIQ
              </Link>
              <nav className="hidden sm:flex gap-4 text-sm text-gray-300">
                <Link href="/" className="hover:text-orange-400 transition-colors">Home</Link>
                <Link href="/subscribe" className="hover:text-orange-400 transition-colors">Plans</Link>
                <Link href="/dashboard" className="hover:text-orange-400 transition-colors">Dashboard</Link>
                <a href="mailto:support@profixiq.com" className="hover:text-orange-400 transition-colors">Support</a>
              </nav>
            </div>
          </header>

          {/* Push content below fixed header */}
          <main className="pt-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}