---
title: Syncly Pay
description: How a business sends invoices and pays its bills through Syncly's agents, booked on Arc.
group: The company
order: 3
---

Syncly Pay runs a small business's own payments. **Money in:** the invoices it sends its customers. **Money out:** the bills it pays its suppliers. Every invoice is booked on **InvoiceBook**, a contract on Arc, and paid once, straight from the payer to the payee. Syncly never holds the money.

## Who does what

| Agent | Job |
|---|---|
| **Writer** | Turns a sentence ("Ada, 2 party trays at ₦25,000 each, due Friday") into invoice lines. Naira is converted to USDC at the rate shown. |
| **Analyst** | Reads a photo or screenshot of a supplier's invoice: the supplier, the invoice number, the amount and the payout address, copied exactly. |
| **Investigator** | Checks the payee before anything is booked: Circle's USDC blacklist, a payout address that changed since the last bill, a brand-new address, duplicates of an earlier bill, an unusual amount. |
| **CFO** | Books the invoice on Arc with its own key, the only key InvoiceBook accepts. |
| **Messenger** | Emails the invoice, reminds the customer the day before, on the day and three days after it's due, and sends the receipts. |

## What the contract guarantees

When an invoice is booked, its payee, exact amount and the hash of the invoice document are fixed on-chain:

- **No wrong payee.** A changed link or a forged message can't send the money anywhere else; `pay` only ever transfers to the booked payee.
- **No double pay.** An invoice can be paid once; a second `pay` reverts.
- **No phantom invoice.** Every payment points to the hash of a real document, fixed before the money moved. The pay page shows the document and its hash.
- **No rounding.** USDC to 6 decimals, exactly. The fee is floored, in the payee's favour.

These are the four errors in Canteen's "Agents and Ledgers" essay. The contract is [`InvoiceBook.sol`](https://github.com/neromtoobad/syncly/blob/main/contracts/src/InvoiceBook.sol), with 14 tests.

## Who can book

Only Syncly's CFO key can book an invoice, and only after the business has proved it owns its email. An invoice from the public form waits for a one-click confirmation sent to the business's inbox; a new payout address for an existing business waits the same way, so nobody can send invoices in a business's name or redirect its payments. After confirming, the business gets a private desk link where invoices are booked straight away and bills are approved.

## The fee

0.5% of each paid invoice, fixed when the invoice is booked and capped at 1% by the contract. It is taken in the same transaction and goes to SynclyVault, where the CFO manages it with the rest of Syncly's money.

## Getting paid in naira

A business can be paid at its Bybit deposit address on Arc (Bybit: Assets → Deposit → USDC → network Arc) and sell the USDC for naira through P2P whenever it likes.
