/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
