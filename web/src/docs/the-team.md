---
title: The team
description: Eleven AI agents with their own wallets. Each pays for its own tools, per call, within limits it can't exceed.
group: The company
order: 1
---

Every agent has its own wallet on Arc and its own balance in **Circle Gateway**. When an agent needs a tool (a search, a page read, a model call) it pays the seller directly with an **x402 nanopayment**, usually a fraction of a cent. Circle batches those payments and settles them on Arc, and each one appears on the job's public receipt.

## Who does what

| Agent | Job | Buys | From |
|---|---|---|---|
| **The CFO** | Prices every job, runs the treasury, never grades the team's work | Nothing: it moves money between the vault's buckets | |
| **Scout** | Finds every business, page and source the brief asks for | Search and maps | Exa, Serper |
| **Researcher** | Turns the brief into a plan and pulls out the facts | AI models | BlockRun |
| **Reader** | Opens websites and PDFs and pulls out what matters | Page reading | Exa, APEX |
| **Writer** | Writes the brief, and a first line for every lead | AI models | BlockRun |
| **Verifier** | Live-checks every email and phone number | Email verification | APEX |
| **Analyst** | Counts, ratings and patterns: the summary on every list | Nothing yet | |
| **Auditor** | Checks the work on a different model family | AI models | BlockRun |
| **Messenger** | Packs the files and emails the delivery | Email sending | AgentMail |
| Illustrator, Mailer | For the coming Content Pack and outreach services | | |

Their wallet addresses are listed on [On Arc](/docs/on-chain#agent-wallets).

## The limits on every payment

An agent can't spend freely. Each payment passes these checks **before** it is signed:

1. **Allowlist.** The seller's site must be on the service's list. An agent on a Local Business Finder job can't pay an unrelated site.
2. **Job budget.** The job's total tool spend can't exceed its budget (for example 0.45 USDC for Local Business Finder).
3. **Price cap.** Each call has a maximum price. If a seller asks for more, the agent refuses.
4. **Pinned payee.** Each seller's payout address is pinned. A changed address is refused and flagged for review. See [Safety controls](/docs/safety#who-we-pay).
5. **Blacklist screening.** The payee is checked against Circle's USDC blacklist.

Only then does the agent sign, and a receipt line is written only after the seller delivers.

## Where their money comes from

The agents' Gateway balances are topped up by **the CFO from the vault's TOOLS bucket**, within each agent's weekly allowance. The first balances were funded by the treasury before the vault existed. See [The CFO](/docs/the-cfo#the-treasury-loop).

## The office

The [office](/office) is an animated picture of all this. The CFO stamps each quote, the brief goes up on the whiteboard, the agents work at their desks, the Auditor takes the lift for sign-off, and the Messenger carries the delivery out of the door. Every movement is driven by a real event from the API.
