"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SolanaCluster = "mainnet" | "devnet";

// Official public RPC often returns 403 from browsers (rate-limit / WAF).
// publicnode is a free public endpoint suitable for local demos; for production use Helius/Alchemy + API key.
export const DEFAULT_RPC = {
  mainnet: "https://solana-rpc.publicnode.com",
  devnet: "https://api.devnet.solana.com",
} as const;

interface SettingsState {
  cluster: SolanaCluster;
  slippageBps: number;
  customRpcUrl: string;
  setCluster: (cluster: SolanaCluster) => void;
  setSlippageBps: (slippageBps: number) => void;
  setCustomRpcUrl: (customRpcUrl: string) => void;
  effectiveRpcUrl: () => string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      cluster: "mainnet",
      slippageBps: 50,
      customRpcUrl: "",
      setCluster: (cluster) => set({ cluster }),
      setSlippageBps: (slippageBps) => set({ slippageBps }),
      setCustomRpcUrl: (customRpcUrl) => set({ customRpcUrl }),
      effectiveRpcUrl: () => {
        const customRpcUrl = get().customRpcUrl.trim();
        if (customRpcUrl) return customRpcUrl;

        return (
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC[get().cluster]
        );
      },
    }),
    { name: "solana-dex-settings" },
  ),
);
