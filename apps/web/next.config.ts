import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Share images are drawn by resvg and encoded by sharp (native binaries), with the fonts of
  // public/fonts.
  serverExternalPackages: ['@resvg/resvg-js', 'sharp'],
  outputFileTracingIncludes: {
    '/carte/**': ['./public/fonts/*.woff'],
    '/club/**': ['./public/fonts/*.woff'],
  },
  typedRoutes: true,
  // Workspace packages are shipped as TypeScript sources.
  transpilePackages: [
    '@legendes/data',
    '@legendes/engine',
    '@legendes/render3d',
    '@legendes/shared',
    '@legendes/ui',
  ],
};

export default withNextIntl(nextConfig);
