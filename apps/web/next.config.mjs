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
  reactStrictMode: true,
  transpilePackages: ['@oni/adapters', '@oni/core'],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  async headers() {
    return [
      {
        // Allow subdomains of localhost in dev
        source: '/(.*)',
        headers: [{ key: 'x-content-type-options', value: 'nosniff' }],
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
