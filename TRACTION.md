# Traction

Generated 2026-10-02 05:28 UTC from Syncly's live records on Arc mainnet (chain 5042). Demo data is never included. Live copy: https://hiresyncly.site/api/traction.md. Money figures are in the owner's private books; every payment below links to its transaction on Arc.

| | |
|---|---|
| Jobs started | 5 (3 customers; 10 quotes given) |
| Delivered · accepted by the customer | 3 · 2 |
| Paid jobs through JobEscrow | 0 |
| Tool payments by agents (x402 via Circle Gateway) | 15 · 15 settled on Arc so far |
| Vendors paid | BlockRun, Exa, Serper |
| CFO decisions carried out on-chain | 1 (8 escalated to the Boss) |

## Contracts and wallets (Arc mainnet)

| | |
|---|---|
| SynclyVault (the treasury's five buckets) | [`0x589e8ec9134777acecb83a9abdf018942ddc9f2b`](https://arcscan.app/address/0x589e8ec9134777acecb83a9abdf018942ddc9f2b) |
| JobEscrow (paid jobs) | [`0xde2ca0c975a1f5789f9b79fe578d43ccf417edbd`](https://arcscan.app/address/0xde2ca0c975a1f5789f9b79fe578d43ccf417edbd) |
| Boss (vault owner, a human's wallet) | [`0xe7aa82bd4659b5af2b16d0af5dcab42fe8089b40`](https://arcscan.app/address/0xe7aa82bd4659b5af2b16d0af5dcab42fe8089b40) |
| CFO (escrow operator, vault CFO key) | [`0xB95dd6425d19BF09d206dc780a758e1C2EF4f1a9`](https://arcscan.app/address/0xB95dd6425d19BF09d206dc780a758e1C2EF4f1a9) |
| Treasury (deployer, funds agents' Gateway balances) | [`0x102AdC546dAE682B7cDD9aB6d624822fdD3DC209`](https://arcscan.app/address/0x102AdC546dAE682B7cDD9aB6d624822fdD3DC209) |

## Jobs

| Created | Order | Service | Status | Payment | Brief |
|---|---|---|---|---|---|
| 2026-09-28 21:20 | [ord_mulr4tw3_2ceb](https://hiresyncly.site/job/ord_mulr4tw3_2ceb) | Local Business Finder | failed | free first job | Every café and coffee shop in Lugbe, Abuja that has no website |
| 2026-09-28 21:29 | [ord_mulrg4ln_b0ff](https://hiresyncly.site/job/ord_mulrg4ln_b0ff) | Local Business Finder | failed | free first job | Every resturant in Lugbe that has no website |
| 2026-09-28 21:41 | [ord_mulrvp33_0603](https://hiresyncly.site/job/ord_mulrvp33_0603) | Local Business Finder | accepted | free first job | Every resturant in Lugbe that has no website |
| 2026-10-01 11:17 | [ord_mupfw9qk_ffc4](https://hiresyncly.site/job/ord_mupfw9qk_ffc4) | Local Business Finder | accepted | free first job | Photography Studio in Lugbe Nigeria. |
| 2026-10-01 11:47 | [ord_mupgyzox_c5f8](https://hiresyncly.site/job/ord_mupgyzox_c5f8) | Local Business Finder | delivered | free first job | Climate change grant available that relates to the National Agency for |

## The CFO's decisions

| When (UTC) | Decision | Transaction |
|---|---|---|
| 2026-09-29 17:05 | Planned week 2: 5 jobs expected, so allowances researcher 0.0500, scout 0.0950, reader 0.0500, writer 0.1000, verifier 0.1000, auditor 0.0500. The plan's hash is sealed on-chain before any money moves. | [0x8af07f69…](https://arcscan.app/tx/0x8af07f69b1c058e51379bbab8c31f3f419a110fd5dc2174988a566dfb4f158d4) |

Every decision, with what the CFO saw and the rule it applied, is in the signed log at https://hiresyncly.site/api/cfo

## Every tool payment

Each line is an x402 payment an agent made from its own Circle Gateway balance on Arc. Circle batches them, so the settlement transaction appears a few minutes after the call.

| When (UTC) | Order | Agent | Vendor | Why | Settled on Arc |
|---|---|---|---|---|---|
| 2026-09-28 21:20 | ord_mulr4tw3_2ceb | researcher | BlockRun claude-haiku-4.5 | parse the request into a search spec | [0xc99ba105…](https://arcscan.app/tx/0xc99ba105332d26b54c73cc1ba1677e299c9dc632eb3f835e50309a40d41d4fbd) |
| 2026-09-28 21:29 | ord_mulrg4ln_b0ff | researcher | BlockRun claude-haiku-4.5 | parse the request into a search spec | [0xc99ba105…](https://arcscan.app/tx/0xc99ba105332d26b54c73cc1ba1677e299c9dc632eb3f835e50309a40d41d4fbd) |
| 2026-09-28 21:41 | ord_mulrvp33_0603 | researcher | BlockRun claude-haiku-4.5 | parse the request into a search spec | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa search | web listings: "restaurant in Lugbe, Abuja, Nigeria" | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa search | web listings: "restaurants in Lugbe Abuja" | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | scout | Exa contents | read 5 listing pages | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-09-28 21:42 | ord_mulrvp33_0603 | researcher | BlockRun claude-haiku-4.5 | extract businesses from the listing pages | [0xb76f1819…](https://arcscan.app/tx/0xb76f1819087eea9c3bbd9886384a44556450a6fa831a1575818165fa0355fe25) |
| 2026-10-01 11:17 | ord_mupfw9qk_ffc4 | researcher | BlockRun claude-haiku-4.5 | parse the request into a search spec | [0xbc7de6df…](https://arcscan.app/tx/0xbc7de6df9f4df4e6b922f4c849e4efe44c5bbbf9d17e24dcba4b38e766f6e228) |
| 2026-10-01 11:17 | ord_mupfw9qk_ffc4 | scout | Serper Maps (Orthogonal) | Google Maps: "Photography studio Lugbe Abuja" p1 | [0xbc7de6df…](https://arcscan.app/tx/0xbc7de6df9f4df4e6b922f4c849e4efe44c5bbbf9d17e24dcba4b38e766f6e228) |
| 2026-10-01 11:17 | ord_mupfw9qk_ffc4 | scout | Serper Maps (Orthogonal) | Google Maps: "Portrait photographer Lugbe" p1 | [0xbc7de6df…](https://arcscan.app/tx/0xbc7de6df9f4df4e6b922f4c849e4efe44c5bbbf9d17e24dcba4b38e766f6e228) |
| 2026-10-01 11:17 | ord_mupfw9qk_ffc4 | scout | Serper Maps (Orthogonal) | Google Maps: "Photo studio services Lugbe Abuja" p1 | [0xbc7de6df…](https://arcscan.app/tx/0xbc7de6df9f4df4e6b922f4c849e4efe44c5bbbf9d17e24dcba4b38e766f6e228) |
| 2026-10-01 11:47 | ord_mupgyzox_c5f8 | researcher | BlockRun claude-haiku-4.5 | parse the request into a search spec | [0xc6f2bb95…](https://arcscan.app/tx/0xc6f2bb95d80f88dae2160f058e386d0100296e3a600977664c3c36420760dc0f) |
| 2026-10-01 11:47 | ord_mupgyzox_c5f8 | scout | Serper Maps (Orthogonal) | Google Maps: "National Agency for the Great Green Wall Abuja" p1 | [0xc6f2bb95…](https://arcscan.app/tx/0xc6f2bb95d80f88dae2160f058e386d0100296e3a600977664c3c36420760dc0f) |
| 2026-10-01 11:47 | ord_mupgyzox_c5f8 | scout | Serper Maps (Orthogonal) | Google Maps: "environmental grant organization Nigeria" p1 | [0xc6f2bb95…](https://arcscan.app/tx/0xc6f2bb95d80f88dae2160f058e386d0100296e3a600977664c3c36420760dc0f) |
| 2026-10-01 11:47 | ord_mupgyzox_c5f8 | scout | Serper Maps (Orthogonal) | Google Maps: "climate change NGO Abuja Nigeria" p1 | [0xc6f2bb95…](https://arcscan.app/tx/0xc6f2bb95d80f88dae2160f058e386d0100296e3a600977664c3c36420760dc0f) |
