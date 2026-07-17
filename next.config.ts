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
};

export default nextConfig;
