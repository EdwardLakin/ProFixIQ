import "./globals.css";
import Providers from "./providers";
import Link from "next/link";
import { Roboto, Black_Ops_One } from "next/font/google";

// Fonts
const roboto = Roboto({
  weight: ["400"], // Regular
  subsets: ["latin"],
  variable: "--font-roboto",
});
const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
});

// Tabs (unchanged from your app)
import { TabsProvider } from "@/features/shared/components/tabs/TabsProvider";
import TabsBar from "@/features/shared/components/tabs/TabsBar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${blackOps.variable} ${roboto.className} bg-black text-white`}>
        <Providers>
          {/* Navbar */}
          <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
            <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="tracking-wide font-header text-orange-400">
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

          {/* Push content below header + global tabs */}
          <div className="pt-16">
            <TabsProvider>
              <TabsBar />
              <main>{children}</main>
            </TabsProvider>
          </div>
        </Providers>
      </body>
    </html>
  );
}