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
| **CFO** | Books the invoice on Arc with its own key, the only key InvoiceBook accepts. With autopay on, pays approved suppliers' bills from the business's own PayVault account, inside the owner's caps, and asks the owner about anything else. Emails the business a report every Monday. |
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

## Autopay, inside limits you set

A business can put USDC aside in its own account on **PayVault**, a contract on Arc, and set the rules from its own wallet: which suppliers may be paid automatically, the most for one bill, and the most per week. When a bill from an approved supplier comes due, the CFO pays it from that balance by itself. The contract checks the rules again on every payment, so the CFO can't pay anyone else or go over a cap, whatever it is told:

- **Inside the rules:** paid on the due date, through InvoiceBook, so the payee and amount are still the booked ones. The decision goes into the CFO's signed log.
- **Outside them** (a supplier that isn't approved, over a cap, or flagged by screening): the CFO can only *propose* it on-chain. The owner sees it on the desk and approves from their wallet, or doesn't.
- **Short of money:** it waits, and the owner is emailed how much to add.
- **The first payment to anyone is the owner's.** The desk offers a supplier for autopay only after the owner has paid it once.

Only the owner's wallet can withdraw, change the limits or approve a supplier. The contract is [`PayVault.sol`](https://github.com/neromtoobad/syncly/blob/main/contracts/src/PayVault.sol), with 12 tests.

## Screening

Everyone a business pays or is paid by is checked every day against Circle's USDC blacklist (and the operator's own deny list), not only when they're first paid: an address that was fine last month may not be today. And one hop out: every USDC transfer those addresses make or receive on Arc is read as it happens, and the other side is screened too. A direct hit stops payments to that address. A supplier that traded with a blacklisted address isn't paid automatically; the owner decides. Findings show on the desk and in the CFO's log.

## The weekly report

Every Monday morning the CFO emails each business its week: money in and out (and how much autopay paid), overdue invoices, a 7-day cash forecast, whether the autopay balance covers next week's bills and how much to add if not, bills waiting for the owner, and screening results. The desk shows the same report and can send it any time.

## Getting paid in naira

A business can be paid at its Bybit deposit address on Arc (Bybit: Assets → Deposit → USDC → network Arc) and sell the USDC for naira through P2P whenever it likes.
