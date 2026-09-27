import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Workspace packages are shipped as TypeScript sources.
  transpilePackages: ['@legendes/engine', '@legendes/render3d', '@legendes/shared', '@legendes/ui'],
};

export default withNextIntl(nextConfig);
