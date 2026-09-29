# Traction

Generated 2026-09-29 18:21 UTC from Syncly's live books on Arc mainnet (chain 5042). Demo data is never included. Live copy: https://synclyhq.up.railway.app/api/traction.md

| | |
|---|---|
| Jobs started | 3 (1 customer; 4 quotes given) |
| Delivered · accepted by the customer | 1 · 1 |
| Paid jobs through JobEscrow | 0 · 0.00 USDC paid in by customers |
| Revenue (accepted, paid jobs) | 0.00 USDC |
| Refunds + bonds paid to customers | 0.00 USDC |
| Tool payments by agents (x402 via Circle Gateway) | 7 · 0.0394 USDC · 7 settled on Arc so far |
| Vendors paid | BlockRun 0.0204, Exa 0.0190 |
| CFO decisions carried out on-chain | 1 (0 escalated to the Boss) |

## Contracts and wallets (Arc mainnet)

| | |
|---|---|
| SynclyVault (the treasury's five buckets) | [`0x589e8ec9134777acecb83a9abdf018942ddc9f2b`](https://arcscan.app/address/0x589e8ec9134777acecb83a9abdf018942ddc9f2b) |
| JobEscrow (paid jobs) | [`0xde2ca0c975a1f5789f9b79fe578d43ccf417edbd`](https://arcscan.app/address/0xde2ca0c975a1f5789f9b79fe578d43ccf417edbd) |
| Boss (vault owner, a human's wallet) | [`0xe7aa82bd4659b5af2b16d0af5dcab42fe8089b40`](https://arcscan.app/address/0xe7aa82bd4659b5af2b16d0af5dcab42fe8089b40) |
| CFO (escrow operator, vault CFO key) | [`0xB95dd6425d19BF09d206dc780a758e1C2EF4f1a9`](https://arcscan.app/address/0xB95dd6425d19BF09d206dc780a758e1C2EF4f1a9) |
| Treasury (deployer, funds agents' Gateway balances) | [`0x102AdC546dAE682B7cDD9aB6d624822fdD3DC209`](https://arcscan.app/address/0x102AdC546dAE682B7cDD9aB6d624822fdD3DC209) |

## Jobs

| Created | Order | Service | Status | Paid | Brief |
|---|---|---|---|---|---|
| 2026-09-28 21:20 | [ord_mulr4tw3_2ceb](https://synclyhq.up.railway.app/job/ord_mulr4tw3_2ceb) | Local Business Finder | failed | free first job | Every café and coffee shop in Lugbe, Abuja that has no website |
| 2026-09-28 21:29 | [ord_mulrg4ln_b0ff](https://synclyhq.up.railway.app/job/ord_mulrg4ln_b0ff) | Local Business Finder | failed | free first job | Every resturant in Lugbe that has no website |
| 2026-09-28 21:41 | [ord_mulrvp33_0603](https://synclyhq.up.railway.app/job/ord_mulrvp33_0603) | Local Business Finder | accepted | free first job | Every resturant in Lugbe that has no website |

## The CFO's decisions

| When (UTC) | Decision | Transaction |
|---|---|---|
| 2026-09-29 17:05 | Planned week 2: 5 jobs expected, so allowances researcher 0.0500, scout 0.0950, reader 0.0500, writer 0.1000, verifier 0.1000, auditor 0.0500. The plan's hash is sealed on-chain before any money moves. | [0x8af07f69…](https://arcscan.app/tx/0x8af07f69b1c058e51379bbab8c31f3f419a110fd5dc2174988a566dfb4f158d4) |

Every decision, with what the CFO saw and the rule it applied, is in the signed log at https://synclyhq.up.railway.app/api/cfo

## Every tool payment

Each line is an x402 payment an agent made from its own Circle Gateway balance on Arc. Circle batches them, so the settlement transaction appears a few minutes after the call.

| When (UTC) | Order | Agent | Vendor | USDC | Why | Settled on Arc |
|---|---|---|---|---|---|---|
| 2026-09-28 21:20 | ord_mulr4tw3_2ceb | researcher | BlockRun claude-haiku-4.5 | 0.0030 | parse the request into a search spec | [0xc99ba105…](https://arcscan.app/tx/0xc99ba105332d26b54c73cc1ba1677e299c9dc632eb3f835e50309a40d41d4fbd) |
| 2026-09-28 21:29 | ord_mulrg4ln_b0ff | researcher | BlockRun claude-haiku-4.5 | 0.0030 | parse the request into a search spec | [0xc99ba105…](https://arcscan.app/tx/0xc99ba105332d26b54c73cc1ba1677e299c9dc632eb3f835e50309a40d41d4fbd) |
| 2026-09-28 21:41 | ord_mulrvp33_0603 | researcher | BlockRun claude-haiku-4.5 | 0.0030 | parse the request into a search spec | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa search | 0.0070 | web listings: "restaurant in Lugbe, Abuja, Nigeria" | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa search | 0.0070 | web listings: "restaurants in Lugbe Abuja" | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa contents | 0.0050 | read 5 listing pages | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | researcher | BlockRun claude-haiku-4.5 | 0.0114 | extract businesses from the listing pages | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
