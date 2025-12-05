// next.config.ts
import path from "path";

const nextConfig = {
  reactStrictMode: true,

  // 👇 Turn OFF Turbopack so we can keep using this webpack config
  experimental: {
    turbo: false,
  },

  webpack(config: any) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname, "src"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@components": path.resolve(__dirname, "src/components"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@types": path.resolve(__dirname, "types"),
    };
    return config;
  },
};

export default nextConfig;