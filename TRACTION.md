# Traction

Generated 2026-09-29 07:10 UTC from Syncly's live books (Arc mainnet). Demo data is never included.

| | |
|---|---|
| Orders | 3 (1 customer) |
| Delivered | 1 |
| Accepted by the customer | 1 |
| Paid jobs accepted (revenue) | 0 · 0.00 USDC |
| Tool payments by agents (x402 via Circle Gateway) | 7 · 0.0394 USDC · 7 settled on Arc so far |
| Vendors paid | BlockRun 0.0204, Exa 0.0190 |

## Jobs

| Created | Order | Service | Status | Brief |
|---|---|---|---|---|
| 2026-09-28 21:20 | ord_mulr4tw3_2ceb | Local Business Finder | failed (free first job) | Every café and coffee shop in Lugbe, Abuja that has no website |
| 2026-09-28 21:29 | ord_mulrg4ln_b0ff | Local Business Finder | failed (free first job) | Every resturant in Lugbe that has no website |
| 2026-09-28 21:41 | ord_mulrvp33_0603 | Local Business Finder | accepted (free first job) | Every resturant in Lugbe that has no website |

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
