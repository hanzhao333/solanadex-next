import type { ReactNode } from "react";
import { AppProviders } from "./providers";
import { AppShell } from "../components/AppShell";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
