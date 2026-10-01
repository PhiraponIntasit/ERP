import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ticket photos are resized client-side to ≤1000px JPEG (~150 KB each, max 6),
  // but leave headroom for the multipart envelope.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
