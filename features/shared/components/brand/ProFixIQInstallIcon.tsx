export function ProFixIQInstallIcon({
  size,
  maskable = false,
}: {
  size: number;
  maskable?: boolean;
}) {
  const markSize = maskable ? size * 0.58 : size * 0.68;

  return (
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at 42% 24%, rgba(23,71,255,0.24), transparent 35%), linear-gradient(145deg, #0D172A 0%, #050B16 100%)",
        display: "flex",
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      <svg
        height={markSize}
        viewBox="0 0 96 96"
        width={markSize}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="install-mark-gradient" x1="12" y1="82" x2="82" y2="10" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1747FF" />
            <stop offset="1" stopColor="#0BB7FF" />
          </linearGradient>
        </defs>
        <path
          d="M18 78V43C18 25.327 32.327 11 50 11h15c11.598 0 21 9.402 21 21S76.598 53 65 53H43"
          fill="none"
          stroke="url(#install-mark-gradient)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="13"
        />
        <path
          d="M43 78V60c0-8.284 6.716-15 15-15h7"
          fill="none"
          stroke="url(#install-mark-gradient)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="13"
        />
      </svg>
    </div>
  );
}

export const installIconResponseHeaders = {
  "Cache-Control": "public, max-age=31536000, immutable",
} satisfies Record<string, string>;
