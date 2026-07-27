import { withSentryConfig } from '@sentry/nextjs';
import { execSync } from 'child_process';

let appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '';
if (!appVersion) {
  try {
    appVersion = execSync('git describe --tags --always').toString().trim();
  } catch (e) {
    appVersion = 'v0.1.0-dev';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@oni/adapters', '@oni/core'],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.oni.vn',
      },
      {
        protocol: 'https',
        hostname: '*.oni.vn',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      }
    ],
  },
  async headers() {
    return [
      {
        // Allow subdomains of localhost in dev
        source: '/(.*)',
        headers: [
          { key: 'x-content-type-options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
