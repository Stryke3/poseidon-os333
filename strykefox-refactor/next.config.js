/** @type {import('next').NextConfig } */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    EDI_API_URL: process.env.EDI_API_URL || 'https://edi.strykefox.com',
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

module.exports = nextConfig
