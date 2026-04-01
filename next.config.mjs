/** @type {import('next').NextConfig} */
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  transpilePackages: ['framer-motion'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com'
      }
    ]
  }
};

export default nextConfig;
