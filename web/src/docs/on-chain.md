---
title: On Arc
description: Every contract, wallet and key transaction, on Arc mainnet (chain 5042).
group: Money and trust
order: 3
---

## Contracts

| Contract | Address | What it does |
|---|---|---|
| **SynclyVault** | [`{{vault}}`](https://explorer.arc.io/address/{{vault}}) | The treasury: five buckets (OPERATING, TOOLS, BOND, RESERVE, PROMO) and the CFO's limits |
| **JobEscrow** | [`{{escrow}}`](https://explorer.arc.io/address/{{escrow}}) | Paid jobs: pay on acceptance, refund plus bond on rejection |
| **InvoiceBook** (Syncly Pay) | [`0x7b0530865040dc44a9cc90270396d7c5bcac8f93`](https://explorer.arc.io/address/0x7b0530865040dc44a9cc90270396d7c5bcac8f93) | Business invoices and bills: payee, amount and document fixed when booked, paid once. |
| **PayVault** (autopay) | [`0x2d9f8eb4bb30f89a92c5acbee68223ee572f3641`](https://explorer.arc.io/address/0x2d9f8eb4bb30f89a92c5acbee68223ee572f3641) | Each business's autopay account: the CFO pays only approved suppliers, under the owner's per-bill and weekly caps; only the owner withdraws or changes the rules. |

## Wallets

| Wallet | Address | Role |
|---|---|---|
| Boss | [`{{boss}}`](https://explorer.arc.io/address/{{boss}}) | Owns the vault. A human's wallet, outside the server's keys. Co-signs anything above the CFO's limits. |
| CFO | [`{{cfo}}`](https://explorer.arc.io/address/{{cfo}}) | The vault's CFO key and the escrow's operator. Signs the decision log. |
| Treasury | [`{{deployer}}`](https://explorer.arc.io/address/{{deployer}}) | Deployed the contracts. Funded the first agents' Gateway balances. |

## Agent wallets

| Agent | Address |
|---|---|
| Scout | [`{{agents.scout}}`](https://explorer.arc.io/address/{{agents.scout}}) |
| Researcher | [`{{agents.researcher}}`](https://explorer.arc.io/address/{{agents.researcher}}) |
| Reader | [`{{agents.reader}}`](https://explorer.arc.io/address/{{agents.reader}}) |
| Writer | [`{{agents.writer}}`](https://explorer.arc.io/address/{{agents.writer}}) |
| Designer | [`{{agents.illustrator}}`](https://explorer.arc.io/address/{{agents.illustrator}}) |
| Producer | [`{{agents.producer}}`](https://explorer.arc.io/address/{{agents.producer}}) |
| Investigator | [`{{agents.investigator}}`](https://explorer.arc.io/address/{{agents.investigator}}) |
| Analyst | [`{{agents.analyst}}`](https://explorer.arc.io/address/{{agents.analyst}}) |
| Auditor | [`{{agents.auditor}}`](https://explorer.arc.io/address/{{agents.auditor}}) |
| Messenger | [`{{agents.messenger}}`](https://explorer.arc.io/address/{{agents.messenger}}) |

Every agent is registered in the vault, which is what lets the CFO top it up.

## Arc and Circle

| | |
|---|---|
| Network | Arc mainnet, chain id 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | [explorer.arc.io](https://explorer.arc.io) |
| USDC | `{{usdc}}` (6 decimals through ERC-20; also Arc's gas token) |
| Circle GatewayWallet | `{{gatewayWallet}}` |

## Key transactions

| Event | Transaction |
|---|---|
| SynclyVault deployed | [{{txs.deploySynclyVault}}](https://explorer.arc.io/tx/{{txs.deploySynclyVault}}) |
| JobEscrow deployed | [{{txs.deployJobEscrow}}](https://explorer.arc.io/tx/{{txs.deployJobEscrow}}) |
| Vault handed to the Boss | [{{txs.setOwner→boss}}](https://explorer.arc.io/tx/{{txs.setOwner→boss}}) |
| The CFO's first weekly plan sealed on-chain | [0x8af07f69…](https://explorer.arc.io/tx/0x8af07f69b1c058e51379bbab8c31f3f419a110fd5dc2174988a566dfb4f158d4) |

Every tool payment's settlement transaction is linked from its job page and from the [traction report](/api/traction.md).
