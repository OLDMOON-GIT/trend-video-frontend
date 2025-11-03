import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fast Refresh 로그 최소화
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // // Cross-Origin 개발 서버 설정
  // experimental: {
  // allowedDevOrigins: ['oldmoon.iptime.org'],
  // },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
    ],
  },
};

export default nextConfig;
