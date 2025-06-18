// app/layout.tsx
import './globals.css';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered diagnostics and workflow for pros and DIYers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-background text-white font-rubik min-h-screen">
        {children}
      </body>
    </html>
  );
}

<div className="bg-green-500 text-white text-xl p-4 rounded-lg shadow-lg">
  ✅ Tailwind is working!
</div>