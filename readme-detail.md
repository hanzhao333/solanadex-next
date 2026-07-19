# solanadex-next · 功能与实现路径

> Next.js App Router 版 Solana DEX 演示前台（由 Vite `solanaDex` 迁移）。  
> **定位**：Solana 链上 Swap / 流动性 / 简易 Trade UI；**未**接入以太坊，也**尚未**把 swap 入库到 trade-hub（学习计划 D25+）。  
> 行号以当前仓库为准；若文件改动较大，请以符号搜索为准。

---

## 1. 项目一览

| 能力 | 路由 | 外部协议 | 核心实现 |
|------|------|----------|----------|
| 品牌首页 | `/` | — | Server Component 文案 + 链到 Swap |
| 连钱包 | 全站顶栏 | Wallet Adapter + Wallet Standard | 自定义按钮 + Phantom 扩展适配器 |
| Swap 兑换 | `/swap` | **Jupiter** v6 API | 报价 → 组交易 → 签名 → 确认轮询 |
| 流动性 | `/pool` | **Raydium** CPMM v2 SDK | 建池 / 加仓 / 撤仓 |
| Trade 演示 | `/trade` | RPC（真实签名列表） | K 线/深度为 mock；Tx 列表链上拉取 |
| 集群 / 滑点 / RPC | 顶栏 | — | zustand + persist |

```text
浏览器
  └─ app/layout.tsx
       ├─ AppProviders（RPC + Wallet + React Query + Buffer polyfill）
       └─ AppShell（导航 / 设置 / ConnectWalletButton）
            ├─ /          Home（Server）
            ├─ /swap      SwapPanel（Client → Jupiter）
            ├─ /pool      PoolPanel（Client → Raydium）
            └─ /trade     Candles / Depth / TxFeed
```

---

## 2. 壳层与基础设施

### 2.1 根 Layout（Server）

| 步骤 | 文件 | 行号 |
|------|------|------|
| 包住全站 Providers + AppShell | `app/layout.tsx` | L7–L20：`RootLayout`；L15–L17 嵌套 |

### 2.2 Providers（Client）

| 步骤 | 文件 | 行号 |
|------|------|------|
| `'use client'` + Buffer polyfill | `app/providers.tsx` | L1；L14–L16 |
| React Query | 同上 | L18–L22；L40 |
| Solana `ConnectionProvider`（读 settings 的 RPC） | 同上 | L24–L33；L25 `effectiveRpcUrl()` |
| `WalletProvider` + 手动 Phantom 适配器 | 同上 | L36–L46；L37 `PhantomExtWalletAdapter` |
| `WalletModalProvider` | 同上 | L43 |

说明：`WalletProvider` 还会通过 Wallet Standard **自动发现** MetaMask Solana / OKX 等扩展；业务仍只签 Solana 交易。

### 2.3 顶栏壳 AppShell

| 步骤 | 文件 | 行号 |
|------|------|------|
| 导航 Swap / Liquidity / Trade | `components/AppShell.tsx` | L10–L14；L37–L56 |
| 集群 mainnet/devnet | 同上 | L58–L68 → `settingsStore` |
| 滑点 bps | 同上 | L69–L78 |
| 自定义 RPC（blur/Enter 生效） | 同上 | L80–L90 |
| 钱包按钮 | 同上 | L91 |

### 2.4 设置与活动 Store

| 能力 | 文件 | 行号 |
|------|------|------|
| 默认 RPC、cluster、slippage、persist | `stores/settingsStore.ts` | L8–L11；L23–L42；`effectiveRpcUrl` L32–L38 |
| Swap/Pool 本地活动流 | `stores/activityStore.ts` | L5–L14 类型；L22–L42 `push`/`update` |

### 2.5 公共 lib / hooks / 类型

| 能力 | 文件 | 行号 |
|------|------|------|
| Jupiter API client | `lib/jupiterClient.ts` | L1–L6（默认 `quote-api.jup.ag/v6`） |
| 签名确认轮询 | `lib/confirmSignature.ts` | L3–L29（默认 90s / 2s） |
| Raydium.load 封装 | `lib/raydium.ts` | L14–L16 programIds；L18–L38 `loadRaydium`（`disableLoadToken`）；L41–L46 mint meta |
| 防抖/节流 | `lib/debounceThrottle.ts` | L3–L8 |
| Connection 工厂（备用） | `lib/solana.ts` | L3–L5 |
| WSOL / USDC mint 常量 | `types/dex.ts` | L2–L5 |
| mint decimals | `hooks/useMintDecimals.ts` | L5–L20 |
| SOL + SPL 余额 | `hooks/useWalletBalances.ts` | L13–L43 |

---

## 3. 功能详解与调用路径

### 3.1 首页（品牌 + 入口）

**做什么**：Server Component 展示品牌，引导进 Swap；钱包在顶栏，不整页 `'use client'`。

| 步骤 | 文件 | 行号 |
|------|------|------|
| 文案 solanaDex / trade-hub | `app/page.tsx` | L3–L28 |
| Link → `/swap` | 同上 | L17–L21 |

---

### 3.2 连接钱包

**做什么**：自定义连接 UI（替代 Vite 版直接用的 `WalletMultiButton`），处理 hydration、安全源、select→connect 手势。

```text
AppShell L91
  → ConnectWalletButton
       → useWallet()（adapter-react）
       → 列表含 Phantom Ext + Standard 钱包
       → PhantomExtWalletAdapter.connect()
```

| 步骤 | 文件 | 行号 |
|------|------|------|
| 仅客户端渲染真实状态（防 hydration） | `components/ConnectWalletButton.tsx` | L17–L22 `useIsClient`；L202–L211 SSR 占位 |
| localhost / HTTPS 校验 | 同上 | L44–L51 `isWalletSafeOrigin`；L119–L124、L179–L183 |
| 选钱包 + `flushSync(select)` 后 connect | 同上 | L107–L157 `selectAdapter` |
| 主按钮连接/断开 | 同上 | L160–L200 |
| Phantom 扩展适配器 | `lib/PhantomExtWalletAdapter.ts` | L32 名称；L154 类；L223+ `connect`；L324+ `signTransaction` |
| 注册进 Provider | `app/providers.tsx` | L37；L42 |

**踩坑备忘**：局域网 `http://192.168.x.x` 常被 Phantom 拒绝；请用 `http://localhost:3000`。

---

### 3.3 Swap（Jupiter 聚合兑换）

**做什么**：选 mint → 输入数量（防抖）→ Jupiter 报价 → 用户签名 → 轮询确认 → 刷新余额。

```text
/swap
  app/swap/page.tsx L1–L12（Server 薄壳）
    → features/swap/SwapPanel.tsx（'use client'）
         1) useMintDecimals + debounced amount
         2) jupiterClient.quoteGet
         3) jupiterClient.swapPost → VersionedTransaction
         4) sendTransaction(wallet)
         5) confirmSignatureWithPolling
         6) activityStore + balances.refetch
```

| 步骤 | 文件 | 行号 |
|------|------|------|
| 路由页 | `app/swap/page.tsx` | L1–L12 |
| 防抖金额 | `features/swap/SwapPanel.tsx` | L35–L45；`lib/debounceThrottle.ts` L3–L4 |
| 报价 query | `SwapPanel.tsx` | L50–L68 → `jupiterClient.quoteGet` |
| Swap mutation：swapPost | 同上 | L71–L84 |
| 反序列化 V0 交易 | 同上 | L86–L88 |
| 钱包 `sendTransaction` | 同上 | L90–L93 |
| 活动记录 + 确认轮询 | 同上 | L95–L110；`lib/confirmSignature.ts` L3–L29 |
| UI：mint / 金额 / Swap 按钮 | `SwapPanel.tsx` | L124–L193 |
| 余额展示 | 同上 | L195–L206；`hooks/useWalletBalances.ts` |

**依赖**：`@jup-ag/api`（`lib/jupiterClient.ts`），环境变量可选 `NEXT_PUBLIC_JUPITER_API_URL`。

---

### 3.4 Pool / Liquidity（Raydium CPMM v2）

**做什么**：连钱包后拉 CPMM fee config；建池、按 poolId 加/撤流动性；`execute({ sendAndConfirm: true })`。

```text
/pool
  app/pool/page.tsx L1–L15
    → features/pool/PoolPanel.tsx
         loadRaydium()  ← lib/raydium.ts
         ├─ getCpmmConfigs
         ├─ cpmm.createPool → execute
         ├─ computePairAmount + addLiquidity → execute
         └─ withdrawLiquidity → execute
```

| 步骤 | 文件 | 行号 |
|------|------|------|
| 路由页 | `app/pool/page.tsx` | L1–L15 |
| SDK 加载（跳过 token list，防超时） | `lib/raydium.ts` | L28–L38 |
| 拉 CPMM configs | `features/pool/PoolPanel.tsx` | L46–L53 |
| **建池** `createPool` + execute | 同上 | L55–L100；核心 L66–L78、L87 |
| **加流动性** compute + addLiquidity | 同上 | L103–L154；L111–L134、L143 |
| **撤流动性** withdrawLiquidity | 同上 | L156–L192；L165–L172、L181 |
| UI 分区（Create / Add / Withdraw） | 同上 | L197 起；按钮约 L259、L302、L323 |

**要求**：钱包需支持 `signAllTransactions`（`lib/raydium.ts` L24–L26）。建议先在 **devnet** 试。

---

### 3.5 Trade（图表 + 链上签名列表）

**做什么**：布局演示；K 线 / 深度为 **mock**；真实拉取地址最近签名并虚拟列表展示；兼显示本地 `activityStore`。

| 步骤 | 文件 | 行号 |
|------|------|------|
| 路由组合 | `app/trade/page.tsx` | L1–L20 |
| K 线（mock） | `features/trade/CandlesChart.tsx` | `export` 约 L23；说明文案约 L88 |
| 深度（mock） | `features/trade/DepthChart.tsx` | `export` 约 L37；说明约 L40 |
| `getSignaturesForAddress` | `features/trade/TxFeed.tsx` | `TxFeed` 约 L80；拉取约 L91 |
| 节流刷新 + react-window | 同上 | 使用 `throttled`（`lib/debounceThrottle.ts` L7–L8）、`List` |

---

## 4. 端到端路径速查（Swap 为例）

```text
用户打开 http://localhost:3000
  → app/layout.tsx L15–L17
  → 顶栏 ConnectWalletButton（ConnectWalletButton.tsx L70+）
  → 点击「进入 Swap」或导航 /swap（page.tsx L17 / AppShell L10）
  → SwapPanel 输入数量（L161–L165）→ 防抖（L35–L45）
  → quoteGet（L60–L67 / jupiterClient.ts L6）
  → 点 Swap（L186–L192）→ swapPost（L77–L84）
  → sendTransaction（L90–L93）→ 钱包弹窗签名
  → confirmSignatureWithPolling（L102 / confirmSignature.ts L12–L26）
  → activityStore.update confirmed（L103）
```

---

## 5. 目录索引

```text
solanadex-next/
├── app/
│   ├── layout.tsx          # 根壳
│   ├── providers.tsx       # Wallet / Connection / Query / Buffer
│   ├── page.tsx            # 首页
│   ├── globals.css
│   ├── swap/page.tsx
│   ├── pool/page.tsx
│   └── trade/page.tsx
├── components/
│   ├── AppShell.tsx
│   └── ConnectWalletButton.tsx
├── features/
│   ├── swap/SwapPanel.tsx
│   ├── pool/PoolPanel.tsx
│   └── trade/{CandlesChart,DepthChart,TxFeed}.tsx
├── hooks/
│   ├── useMintDecimals.ts
│   └── useWalletBalances.ts
├── lib/
│   ├── jupiterClient.ts
│   ├── confirmSignature.ts
│   ├── raydium.ts
│   ├── PhantomExtWalletAdapter.ts
│   ├── debounceThrottle.ts
│   └── solana.ts
├── stores/
│   ├── settingsStore.ts
│   └── activityStore.ts
├── types/dex.ts
└── readme-detail.md        # 本文件
```

---

## 6. 明确不做 / 待做（对照学习计划）

| 项 | 状态 |
|----|------|
| Vite → Next 脚手架 + 钱包 | 已做（D22） |
| Swap 迁 Jupiter 流程 | 已做（D23） |
| Pool 页调 trade-hub `GET /dex/pools` SSR | 待做（D24）；当前 Pool 仍是 Raydium Client |
| axios 登录、`POST /dex/swaps` 入库 | 待做（D25） |
| 以太坊 / wagmi / 原生 ETH | **不做**（纯 Solana） |

---

## 7. 本地运行

```powershell
cd c:\Users\zhanghz\Desktop\cursor-space\solanadex-next
npm install
npm run dev
```

浏览器请用 **`http://localhost:3000`**（不要用裸 HTTP 局域网 IP 连 Phantom）。

可选环境变量：

- `NEXT_PUBLIC_SOLANA_RPC_URL` — 覆盖默认 RPC（见 `settingsStore.ts` L36–L37）
- `NEXT_PUBLIC_JUPITER_API_URL` — 覆盖 Jupiter basePath（见 `jupiterClient.ts` L3–L4）
