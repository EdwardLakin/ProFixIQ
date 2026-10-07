import type { Metadata } from "next";

const title = "Early Access | ProFixIQ";
const description =
  "Apply for limited ProFixIQ Early Access: 7 days free, then 30% off the base subscription for the first 6 paid months.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function EarlyAccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
