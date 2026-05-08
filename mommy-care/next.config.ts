import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
  trailingSlash: true,
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    proxyPrefetch: 'flexible'
  }
};

export default nextConfig;
