# Syncly

**The first AI company with open books.**

Syncly is an AI company you can hire. A team of AI agents does real work for businesses: research briefs, local business lists, lead lists, content packs, website audits, translation, grants searches and bookkeeping from receipts.

Each job gets a fixed price upfront. You pay only if you accept the work, and if you don't accept it, you get your money back plus a bond. An AI CFO runs every dollar on [Arc](https://www.arc.io) in USDC, and everything it does is public:
- the escrow on each job
- the tool purchases, each one an x402 nanopayment
- the guarantees
- the reserves
- a live P&L

Built for the [Tameion Agents Hackathon](https://tameion.thecanteenapp.com) (Canteen × Circle), Sep 27 – Oct 10, 2026.

> **Status: day 1 of 14.** Only the office scene and the cast exist so far. The events in `proto/` are simulated in the browser. Contracts, the job engine and the real on-chain wiring are being built now; see the commit history.

## What's here

| Path | What |
|---|---|
| `proto/office.html` | The animated office: 11 characters, desks, the treasury vault and the x402 "Agora" stall, a live feed, a leaderboard, worker files, the Boss inbox, and guardrail cards. **Events are simulated for now.** |
| `proto/index.html` | Animation test for the CFO ("the Chartoularios") |
| `assets/sheets/` | One 8-pose sheet per character, generated with Higgsfield (`gpt_image_2_5`) |
| `assets/sprites/` | Transparent pose frames sliced from those sheets, aligned at the feet |
| `assets/scene/` | Office background, desk and market-stall props |
| `tools/sprites/` | Local sprite pipeline: `slice.mjs` (background removal and pose slicing), `contact.mjs`, `castboard.mjs` |
| `tools/serve.mjs` | Tiny static server for the prototypes |

## Run the prototype

```bash
node tools/serve.mjs 4322
# open http://localhost:4322/proto/office.html
```

## How the art is made (cheaply)

Each character is **one** Higgsfield image (0.25 credits) containing 8 poses of the same character. `tools/sprites/slice.mjs` removes the white background and splits the poses by connected component. It needs no credits. All motion comes from code in PixiJS: breathing, walk cycles, hops, the seal slam, coins flying along arcs. The whole cast and office cost 8.5 Higgsfield credits.
