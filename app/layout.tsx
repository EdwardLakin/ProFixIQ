// app/layout.tsx
import "./globals.css";
import { Roboto, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";

// Fonts: body → Roboto, headers/buttons → Black Ops One
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});
const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
});

// Tabs (browser-in-browser)
import { TabsProvider } from "@/features/shared/components/tabs/TabsProvider";
import TabsBar from "@/features/shared/components/tabs/TabsBar";

export const metadata = {
  title: "ProFixIQ",
  description: "Tech tools for modern shops",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${blackOps.variable} bg-black text-white`}>
        <Providers>
          {/* Global app shell (desktop header + mobile shell) */}
          <AppShell>
            {/* Global tabs with persistence */}
            <TabsProvider>
              <TabsBar />
              <main>{children}</main>
            </TabsProvider>
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}