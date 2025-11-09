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
    unoptimized: true, // 이미지 최적화 비활성화 (쿠팡 CDN 직접 사용)
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
      {
        protocol: "https",
        hostname: "*.coupangcdn.com", // 쿠팡 이미지
      },
      {
        protocol: "http",
        hostname: "thumbnail*.coupangcdn.com", // 쿠팡 썸네일
      },
    ],
  },
};

export default nextConfig;
