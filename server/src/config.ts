// Arc mainnet + Circle Gateway constants. Values verified on 2026-09-28 against
// CHAIN_CONFIGS.arc in @circle-fin/x402-batching 3.5.0 and eth_chainId on the public RPC.
export const ARC = {
  name: 'arc',
  chainId: 5042,
  // Canteen's per-builder RPC key (arc-canteen) covers Arc testnet only; mainnet uses ARC_RPC.
  rpc: process.env.ARC_RPC ?? 'https://rpc.mainnet.arc.io',
  usdc: '0x3600000000000000000000000000000000000000',
  gatewayWallet: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',
  gatewayMinter: '0x2222222d7164433c4C09B0b0D809a9b52C04C205',
  explorer: process.env.ARC_EXPLORER ?? 'https://arcscan.app',
} as const;

/** OUTLAY_DRY=1 → no payments, tools return fixtures. For testing plumbing only. */
export const DRY = process.env.OUTLAY_DRY === '1';

export const DATA_DIR = process.env.OUTLAY_DATA ?? new URL('../data/', import.meta.url).pathname;

/** Models (BlockRun, OpenAI-compatible). The Auditor must use a different family from the maker. */
export const MODELS = {
  maker: process.env.MODEL_MAKER ?? 'anthropic/claude-sonnet-4.6',
  fast: process.env.MODEL_FAST ?? 'anthropic/claude-haiku-4.5',
  auditor: process.env.MODEL_AUDITOR ?? 'openai/gpt-5.4-mini',
} as const;
