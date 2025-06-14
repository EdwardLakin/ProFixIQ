import path from 'path';
import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = {
      ...(config.resolve || {}),
      alias: {
        ...(config.resolve?.alias || {}),
        '@': path.resolve(__dirname, 'src'),
      },
    };
    return config;
  },
};

export default nextConfig;