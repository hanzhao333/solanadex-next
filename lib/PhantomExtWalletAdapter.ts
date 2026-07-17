"use client";

import {
  BaseMessageSignerWalletAdapter,
  scopePollingDetectionStrategy,
  WalletAccountError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSignMessageError,
  WalletSignTransactionError,
  type WalletName,
} from "@solana/wallet-adapter-base";
import {
  PublicKey,
  Transaction,
  type TransactionVersion,
  VersionedTransaction,
} from "@solana/web3.js";

function isVersionedTransaction(
  transaction: Transaction | VersionedTransaction,
): transaction is VersionedTransaction {
  return "version" in transaction;
}

export const PhantomExtWalletName = "Phantom Ext" as WalletName<"Phantom Ext">;

let debugSequence = 0;

export function walletDebug(
  step: string,
  details: Record<string, unknown> = {},
) {
  debugSequence += 1;
  console.info(`[wallet-debug #${debugSequence}] ${step}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

export function walletErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { value: String(error) };
  }

  const walletError = error as Error & {
    code?: string | number;
    cause?: unknown;
  };
  return {
    name: walletError.name,
    message: walletError.message,
    code: walletError.code,
    cause:
      walletError.cause instanceof Error
        ? {
            name: walletError.cause.name,
            message: walletError.cause.message,
            code: (walletError.cause as Error & { code?: string | number })
              .code,
          }
        : walletError.cause,
  };
}

type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey: { toBytes(): Uint8Array } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toBytes(): Uint8Array } } | void>;
  disconnect: () => Promise<void>;
  request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction: (
    tx: Transaction | VersionedTransaction,
    opts?: unknown,
  ) => Promise<{ signature: string }>;
  on: (event: string, handler: (...args: never[]) => void) => void;
  off: (event: string, handler: (...args: never[]) => void) => void;
};

export function getPhantomProvider(): PhantomProvider | null {
  const provider = (
    globalThis as unknown as { phantom?: { solana?: PhantomProvider } }
  ).phantom?.solana;
  return provider?.isPhantom ? provider : null;
}

export function getWalletEnvironment() {
  const scope = globalThis as unknown as {
    location?: { origin?: string };
    document?: { visibilityState?: string };
    isSecureContext?: boolean;
    phantom?: { solana?: PhantomProvider };
    solana?: { isPhantom?: boolean };
  };
  const provider = scope.phantom?.solana;

  return {
    origin: scope.location?.origin,
    visibility: scope.document?.visibilityState,
    secureContext: scope.isSecureContext === true,
    phantomInjected: Boolean(provider),
    phantomFlag: provider?.isPhantom === true,
    phantomConnected: provider?.isConnected === true,
    phantomHasPublicKey: Boolean(provider?.publicKey),
    phantomConnectFunction: typeof provider?.connect === "function",
    phantomRequestFunction: typeof provider?.request === "function",
    windowSolanaIsPhantom: scope.solana?.isPhantom === true,
  };
}

function connectProviderWithTimeout(
  provider: PhantomProvider,
  timeoutMs = 20_000,
) {
  const connectPromise = provider.connect({ onlyIfTrusted: false });
  return new Promise<Awaited<ReturnType<PhantomProvider["connect"]>>>(
    (resolve, reject) => {
      const timer = window.setTimeout(() => {
        const error = new WalletConnectionError(
          `Phantom provider.connect() timed out after ${timeoutMs}ms`,
        );
        walletDebug("provider:connect:timeout", {
          timeoutMs,
          ...getWalletEnvironment(),
        });
        reject(error);
      }, timeoutMs);

      connectPromise.then(
        (result) => {
          window.clearTimeout(timer);
          resolve(result);
        },
        (error: unknown) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    },
  );
}

/** Direct Phantom injected provider — never touches window.solana / MetaMask. */
export class PhantomExtWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = PhantomExtWalletName;
  url = "https://phantom.app";
  icon =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiB2aWV3Qm94PSIwIDAgMTA4IDEwOCIgZmlsbD0ibm9uZSI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9IiNBQjlGRjIiLz4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik00Ni41MjY3IDY5LjkyMjlDNDIuMDA1NCA3Ni44NTA5IDM0LjQyOTIgODUuNjE4MiAyNC4zNDggODUuNjE4MkMxOS41ODI0IDg1LjYxODIgMTUgODMuNjU2MyAxNSA3NS4xMzQyQzE1IDUzLjQzMDUgNDQuNjMyNiAxOS44MzI3IDcyLjEyNjggMTkuODMyN0M4Ny43NjggMTkuODMyNyA5NCAzMC42ODQ2IDk0IDQzLjAwNzlDOTQgNTguODI1OCA4My43MzU1IDc2LjkxMjIgNzMuNTMyMSA3Ni45MTIyQzcwLjI5MzkgNzYuOTEyMiA2OC43MDUzIDc1LjEzNDIgNjguNzA1MyA3Mi4zMTRDNjguNzA1MyA3MS41NzgzIDY4LjgyNzUgNzAuNzgxMiA2OS4wNzE5IDY5LjkyMjlDNjUuNTg5MyA3NS44Njk5IDU4Ljg2ODUgODEuMzg3OCA1Mi41NzU0IDgxLjM4NzhDNDcuOTkzIDgxLjM4NzggNDUuNjcxMyA3OC41MDYzIDQ1LjY3MTMgNzQuNDU5OEM0NS42NzEzIDcyLjk4ODQgNDUuOTc2OCA3MS40NTU2IDQ2LjUyNjcgNjkuOTIyOVpNODMuNjc2MSA0Mi41Nzk0QzgzLjY3NjEgNDYuMTcwNCA4MS41NTc1IDQ3Ljk2NTggNzkuMTg3NSA0Ny45NjU4Qzc2Ljc4MTYgNDcuOTY1OCA3NC42OTg5IDQ2LjE3MDQgNzQuNjk4OSA0Mi41Nzk0Qzc0LjY5ODkgMzguOTg4NSA3Ni43ODE2IDM3LjE5MzEgNzkuMTg3NSAzNy4xOTMxQzgxLjU1NzUgMzcuMTkzMSA4My42NzYxIDM4Ljk4ODUgODMuNjc2MSA0Mi41Nzk0Wk03MC4yMTAzIDQyLjU3OTVDNzAuMjEwMyA0Ni4xNzA0IDY4LjA5MTYgNDcuOTY1OCA2NS43MjE2IDQ3Ljk2NThDNjMuMzE1NyA0Ny45NjU4IDYxLjIzMyA0Ni4xNzA0IDYxLjIzMyA0Mi41Nzk1QzYxLjIzMyAzOC45ODg1IDYzLjMxNTcgMzcuMTkzMSA2NS43MjE2IDM3LjE5MzFDNjguMDkxNiAzNy4xOTMxIDcwLjIxMDMgMzguOTg4NSA3MC4yMTAzIDQyLjU3OTVaIiBmaWxsPSIjRkZGREY4Ii8+Cjwvc3ZnPg==";
  supportedTransactionVersions: ReadonlySet<TransactionVersion> | null =
    new Set(["legacy", 0]);

  private _connecting = false;
  private _wallet: PhantomProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _readyState =
    typeof window === "undefined"
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;

  constructor() {
    super();
    walletDebug("adapter:constructed", getWalletEnvironment());
    if (this._readyState === WalletReadyState.Unsupported) return;
    scopePollingDetectionStrategy(() => {
      if (getPhantomProvider()) {
        this._readyState = WalletReadyState.Installed;
        walletDebug("adapter:detected", getWalletEnvironment());
        this.emit("readyStateChange", this._readyState);
        return true;
      }
      return false;
    });
  }

  get publicKey() {
    return this._publicKey;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return this._readyState;
  }

  private _onDisconnect = () => {
    walletDebug("provider:event:disconnect");
    const wallet = this._wallet;
    if (!wallet) return;
    wallet.off("disconnect", this._onDisconnect);
    wallet.off("accountChanged", this._onAccountChanged);
    this._wallet = null;
    this._publicKey = null;
    this.emit("error", new WalletDisconnectedError());
    this.emit("disconnect");
  };

  private _onAccountChanged = (key: { toBytes(): Uint8Array }) => {
    walletDebug("provider:event:accountChanged", {
      hasAccount: Boolean(key),
    });
    if (!this._publicKey) return;
    try {
      const next = new PublicKey(key.toBytes());
      if (this._publicKey.equals(next)) return;
      this._publicKey = next;
      this.emit("connect", next);
    } catch (error: unknown) {
      const err = error as Error;
      this.emit("error", new WalletPublicKeyError(err?.message, err));
    }
  };

  async connect(): Promise<void> {
    walletDebug("adapter:connect:start", {
      adapterConnected: this.connected,
      adapterConnecting: this._connecting,
      readyState: this.readyState,
      ...getWalletEnvironment(),
    });
    try {
      if (this.connected || this._connecting) {
        walletDebug("adapter:connect:skipped", {
          adapterConnected: this.connected,
          adapterConnecting: this._connecting,
        });
        return;
      }

      const wallet = getPhantomProvider();
      if (!wallet) throw new WalletNotReadyError();
      this._readyState = WalletReadyState.Installed;
      this._connecting = true;

      // Clear half-connected / stuck extension state, then force a visible prompt.
      try {
        if (wallet.isConnected && !wallet.publicKey) {
          walletDebug("provider:disconnect:half-connected");
          await wallet.disconnect();
          walletDebug("provider:disconnect:half-connected:resolved");
        }
      } catch (error) {
        walletDebug(
          "provider:disconnect:half-connected:rejected",
          walletErrorDetails(error),
        );
      }

      if (!wallet.publicKey) {
        try {
          walletDebug("provider:connect:call", getWalletEnvironment());
          await connectProviderWithTimeout(wallet);
          walletDebug("provider:connect:resolved", getWalletEnvironment());
        } catch (error: unknown) {
          walletDebug(
            "provider:connect:rejected",
            walletErrorDetails(error),
          );
          const err = error as Error;
          throw new WalletConnectionError(
            err?.message ?? "Phantom connect failed",
            err,
          );
        }
      }

      if (!wallet.publicKey) throw new WalletAccountError();

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(wallet.publicKey.toBytes());
      } catch (error: unknown) {
        const err = error as Error;
        throw new WalletPublicKeyError(err?.message, err);
      }

      wallet.on("disconnect", this._onDisconnect);
      wallet.on("accountChanged", this._onAccountChanged);
      this._wallet = wallet;
      this._publicKey = publicKey;
      walletDebug("adapter:connect:emit", {
        hasPublicKey: true,
      });
      this.emit("connect", publicKey);
    } catch (error: unknown) {
      walletDebug("adapter:connect:failed", walletErrorDetails(error));
      this.emit("error", error as WalletError);
      throw error;
    } finally {
      this._connecting = false;
      walletDebug("adapter:connect:finished", {
        adapterConnected: this.connected,
        hasPublicKey: Boolean(this._publicKey),
      });
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      wallet.off("disconnect", this._onDisconnect);
      wallet.off("accountChanged", this._onAccountChanged);
      this._wallet = null;
      this._publicKey = null;
      try {
        await wallet.disconnect();
      } catch (error: unknown) {
        const err = error as Error;
        this.emit("error", new WalletDisconnectionError(err?.message, err));
      }
    }
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signTransaction(transaction)) || transaction;
      } catch (error: unknown) {
        const err = error as Error;
        throw new WalletSignTransactionError(err?.message, err);
      }
    } catch (error: unknown) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        return (await wallet.signAllTransactions(transactions)) || transactions;
      } catch (error: unknown) {
        const err = error as Error;
        throw new WalletSignTransactionError(err?.message, err);
      }
    } catch (error: unknown) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const { signature } = await wallet.signMessage(message);
        return signature;
      } catch (error: unknown) {
        const err = error as Error;
        throw new WalletSignMessageError(err?.message, err);
      }
    } catch (error: unknown) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Parameters<BaseMessageSignerWalletAdapter["sendTransaction"]>[1],
    options: Parameters<BaseMessageSignerWalletAdapter["sendTransaction"]>[2] = {},
  ) {
    try {
      const wallet = this._wallet;
      if (!wallet) throw new WalletNotConnectedError();
      try {
        const { signers, ...sendOptions } = options;
        let tx = transaction;
        if (isVersionedTransaction(tx)) {
          if (signers?.length) tx.sign(signers);
        } else {
          tx = (await this.prepareTransaction(
            tx,
            connection,
            sendOptions,
          )) as typeof tx;
          if (signers?.length) (tx as Transaction).partialSign(...signers);
        }
        const { signature } = await wallet.signAndSendTransaction(tx, {
          ...sendOptions,
          preflightCommitment:
            sendOptions.preflightCommitment || connection.commitment,
        });
        return signature;
      } catch (error: unknown) {
        const err = error as Error;
        throw new WalletConnectionError(err?.message, err);
      }
    } catch (error: unknown) {
      this.emit("error", error as WalletError);
      throw error;
    }
  }
}
