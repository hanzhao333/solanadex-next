import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN IP access in dev (HMR / _next chunks).
  allowedDevOrigins: ["192.168.5.131"],
  // Keep wallet-adapter in the app graph so WalletModalContext stays a singleton.
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
  ],
  // D25：浏览器同源 /hub/* → trade-hub，避免 CORS（G6 方案 B）
  async rewrites() {
    const upstream =
      process.env.TRADE_HUB_API_URL?.replace(/\/$/, "") ||
      "http://127.0.0.1:8080";
    return [
      {
        source: "/hub/:path*", // 匹配/hub前缀开头的路径
        destination: `${upstream}/:path*`, // 将匹配的路径，重新转发，这一层是服务器转发，所以不存在跨域
      },
    ];
  },
};

export default nextConfig;
