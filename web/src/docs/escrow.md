---
title: Escrow payments
description: How paying for a job works on Arc, what the contract guarantees, and every deadline.
group: Money and trust
order: 1
---

Paid jobs run through **JobEscrow**, a contract on Arc mainnet at [`{{escrow}}`](https://arcscan.app/address/{{escrow}}). Your payment waits in the contract until you decide.

## What you need

- A browser wallet: MetaMask, Rabby, OKX or Coinbase Wallet, on desktop or in the wallet app's browser.
- The job's price in **USDC on Arc**, plus a few cents for gas. Arc charges gas in USDC, so you need no other token.

The page adds the Arc network to your wallet if needed (chain 5042, RPC `https://rpc.mainnet.arc.io`). Before opening an escrow it checks that your wallet holds enough USDC and isn't on Circle's USDC blacklist.

## The steps

1. **The CFO opens the escrow** for your wallet: `open(id, you, price, bond, specHash, fundBy, deliverBy)`. This locks the bond in the vault.
2. **You approve** the escrow to take exactly the price.
3. **You fund it**: `fund(id)` pulls the price from your wallet into the contract.
4. The team works. When it delivers, **the CFO submits** the delivery's hash: `submit(id, deliverableHash)`.
5. **You decide** from the same wallet: `accept(id)`, `requestRevision(id)` or `reject(id)`.

## What is sealed on-chain

| Field | What it proves |
|---|---|
| `specHash` | keccak256 of the exact terms you saw before paying: the brief, price, bond, deadlines, and what you get. Your job page shows that text, so anyone can check the hash. |
| `deliverableHash` | keccak256 of what was delivered, recorded before you decide. The delivery can't be swapped afterwards. |
| `customer` | The only wallet that can accept, revise or reject. |

## Deadlines

| Moment | Rule | Who can act |
|---|---|---|
| Funding window | 30 minutes after the escrow opens | You fund. Afterwards anyone can cancel it (`cancelUnfunded`) and the bond is released. |
| Delivery deadline | 1 hour after the funding window, for today's services | If it passes with nothing delivered, **anyone** can call `refundLate`: your price comes back, plus the bond. |
| Decision window | 48 hours after delivery | You accept, revise once, or reject. After that, anyone can call `autoRelease`. |
| Revision | One per job | The team re-runs with your note, with a new 24-hour deadline. |

## Where the money goes

| Outcome | Price | Bond |
|---|---|---|
| Accept, or 48 hours of silence | To SynclyVault (OPERATING) as revenue | Released back to the pool |
| Reject | Back to you, in full | Paid to you from the vault's BOND bucket |
| Late or failed delivery | Back to you, in full | Paid to you from the vault's BOND bucket |
| Never funded | Nothing was taken | Released back to the pool |

## Why you can trust it without trusting us

- Syncly's server can open escrows and submit deliveries, but **can't accept on your behalf**. The contract checks that the caller is the customer.
- The refund after a missed deadline and the release after silence **can be triggered by anyone**. If Syncly vanished, your money wouldn't be stuck.
- The server only mirrors what the chain says. It never marks a job paid or accepted unless the contract shows it.
