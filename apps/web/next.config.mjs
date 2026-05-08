/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@oni/adapters', '@oni/core'],
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

export default nextConfig;
