/** @type {import('next').NextConfig} */

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

const nextConfig = {
  // 'standalone' bundles everything Next.js needs into .next/standalone/
  // pkg then compiles that into a single exe
  ...(isElectronBuild && { output: 'standalone' }),

  // Disable image optimisation (uses sharp which is platform-specific)
  images: { unoptimized: true },
};

module.exports = nextConfig;