// next.config.ts
import path from "path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  register: false,
  disable: process.env.NODE_ENV !== "production",
  additionalPrecacheEntries: [
    { url: "/offline", revision: null },
    { url: "/offline/sync", revision: null },
    { url: "/mobile", revision: null },
    { url: "/mobile/offline", revision: null },
    { url: "/mobile/tech/queue", revision: null },
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // /legal/* pages read their content from docs/legal/*.md at request time via
  // fs.readFileSync. That directory sits outside app/ and public/, so it isn't
  // reliably picked up by Next's automatic serverless file tracing — make the
  // inclusion explicit so the deployed function always has the source files.
  outputFileTracingIncludes: {
    "app/legal/**/*": ["./docs/legal/**/*.md"],
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "scjjkmuwadwkaaqjoigx.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const supabaseHost = "scjjkmuwadwkaaqjoigx.supabase.co";

    const csp = [
      `default-src 'self'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `frame-ancestors 'none'`,
      `form-action 'self'`,
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: https://${supabaseHost} https://chart.googleapis.com`,
      `font-src 'self' data:`,
      `media-src 'self' blob: https://${supabaseHost}`,
      `worker-src 'self' blob:`,
      `frame-src 'self'`,
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://api.openai.com wss://api.openai.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
      `upgrade-insecure-requests`,
    ].join("; ");

    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()",
      },
      ...(isDev
        ? []
        : [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains",
            },
          ]),
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },

  webpack(config: any) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@ericblade/quagga2$": path.resolve(
        __dirname,
        "node_modules/@ericblade/quagga2/dist/quagga.min.js",
      ),
      "@": path.resolve(__dirname, "src"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@components": path.resolve(__dirname, "src/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@types": path.resolve(__dirname, "types"),
    };
    return config;
  },
};

export default withSerwist(nextConfig);
