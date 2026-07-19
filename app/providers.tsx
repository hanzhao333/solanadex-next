"use client";

import { Buffer } from "buffer";
import { type ReactNode, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomExtWalletAdapter } from "../lib/PhantomExtWalletAdapter";
import { useSettingsStore } from "../stores/settingsStore";

if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1 },
  },
});

function SolanaConnectionShell({ children }: { children: ReactNode }) {
  // Subscribe so endpoint updates when cluster / custom RPC change.
  // Do not remount with a key — that tears down WalletProvider and leaves a
  // selected-but-disconnected wallet, which makes "Select Wallet" look dead.
  useSettingsStore((s) => s.cluster);
  useSettingsStore((s) => s.customRpcUrl);
  const endpoint = useSettingsStore((s) => s.effectiveRpcUrl());
  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ commitment: "confirmed" }}
    >
      {children}
    </ConnectionProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomExtWalletAdapter()], []);

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaConnectionShell>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </SolanaConnectionShell>
    </QueryClientProvider>
  );
}
