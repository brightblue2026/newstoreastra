import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() / unauthorized(), used by the /admin role guards so
    // a permitted-but-insufficient role gets a 403 rather than a redirect.
    authInterrupts: true,
  },

  images: {
    // Product imagery is served from Cloudinary.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    formats: ['image/avif', 'image/webp'],
  },

  // The Prisma client is generated into src/generated and must not be bundled
  // for the browser or traced as an edge dependency.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],

  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
