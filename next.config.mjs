/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Externalize packages that use dynamic requires (stealth plugin dependencies)
  serverComponentsExternalPackages: [
    'playwright-extra',
    'puppeteer-extra-plugin-stealth',
    'playwright'
  ],
  
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle these packages on the server
      config.externals = [
        ...config.externals,
        'playwright-extra',
        'puppeteer-extra-plugin-stealth',
        'puppeteer-extra-plugin'
      ];
    }
    
    return config;
  },
};

export default nextConfig;

