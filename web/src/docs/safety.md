---
title: Safety controls
description: The ways software that moves money usually fails, and what Syncly does about each one.
group: Money and trust
order: 2
---

Canteen's essay [*Agents and Ledgers in 2026*](https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html) lists the mistakes an AI can make with money that still leave the books balanced. This page goes through them one by one.

## Who we pay

**The risk:** paying the wrong party. Reconciling against the chain can't catch it, because the chain confirms you paid exactly whom you chose.

**What we do:**

- Each seller's payout address is **pinned per service** in [`payees.json`](https://github.com/neromtoobad/syncly/blob/main/server/src/payees.json), which is reviewed in git. A new service is pinned on its first payment.
- If a seller asks to be paid at a different address, the payment is **refused before anything is signed** and the refusal goes into the CFO's log for review.
- Every payee, and every customer wallet before an escrow opens, is **screened against Circle's USDC blacklist**.
- An escrow's customer is fixed when it opens, and only that wallet can receive a refund or a bond.

## Paying twice

**The risk:** a call times out, the software retries, and the seller is paid twice.

**What we do:** an agent's payment has two phases, a free request that returns the price and then the signed payment. A timeout before signing is retried. A timeout **after** signing is ambiguous (the seller may already have the money), so it is **not retried**. The agent retries only when the seller says it didn't take the payment. A [test against a fake seller](https://github.com/neromtoobad/syncly/blob/main/server/scripts/pay-safety.ts) checks each case.

## Payments that never happened

**The risk:** the books record a payment that never went out.

**What we do:** a receipt line is written only after a paid call succeeds. Each is then linked to the settlement transaction Circle Gateway produced on Arc, a record from outside our own books.

## Rounding

**The risk:** reading `6.000000` as `6.00` and hiding the difference in a "round-off" account.

**What we do:** the ledger keeps USDC's six decimals and refuses an unbalanced entry. There is no silent round-off account.

## Letting a model release money

**The risk:** an escrow that pays out because an AI said "HIGH confidence".

**What we do:** only the customer's wallet releases a payment. The CFO's rules are deterministic, and AI models only produce the work and check it. The Auditor can flag work but can't approve a payment.

## An entry with no document

**The risk:** a ledger line nobody can trace to a real order.

**What we do:** every ledger line points to its job. Every escrow seals the terms (`specHash`) and the delivery (`deliverableHash`) on-chain, so terms, delivery and payment can be matched.

## Limits the agents can't talk past

| Limit | Enforced by |
|---|---|
| Sellers allowed per service | The payment code, before signing |
| Budget per job, price cap per call | The payment code, before signing |
| CFO moves at most 2 USDC alone | The SynclyVault contract (`maxMove`) |
| Weekly tool budget, reserve floor, bond cover | The SynclyVault contract |
| Only the customer accepts or rejects | The JobEscrow contract |

> **Honest limit** The payment code's checks run on our server. The contract limits apply to the vault and the escrow, not to what an agent may spend from its own Gateway balance once topped up. That is why top-ups are small and weekly.
