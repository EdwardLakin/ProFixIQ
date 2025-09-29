import "./globals.css";
import { Roboto, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import PhoneShell from "@/features/launcher/PhoneShell";

// Fonts: body → Roboto, headers/buttons → Black Ops One
const roboto = Roboto({ subsets: ["latin"], weight: ["400","500","700"], variable: "--font-roboto" });
const blackOps = Black_Ops_One({ weight: "400", subsets: ["latin"], variable: "--font-blackops" });

export const metadata = {
  title: "ProFixIQ",
  description: "Tech tools for modern shops",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${blackOps.variable} bg-black text-white`}>
        <Providers>
          <PhoneShell>
            <main>{children}</main>
          </PhoneShell>
        </Providers>
      </body>
    </html>
  );
}
