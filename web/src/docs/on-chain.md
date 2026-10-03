---
title: On Arc
description: Every contract, wallet and key transaction, on Arc mainnet (chain 5042).
group: Money and trust
order: 3
---

## Contracts

| Contract | Address | What it does |
|---|---|---|
| **SynclyVault** | [`{{vault}}`](https://arcscan.app/address/{{vault}}) | The treasury: five buckets (OPERATING, TOOLS, BOND, RESERVE, PROMO) and the CFO's limits |
| **JobEscrow** | [`{{escrow}}`](https://arcscan.app/address/{{escrow}}) | Paid jobs: pay on acceptance, refund plus bond on rejection |
| **InvoiceBook** (Syncly Pay) | [`0x7b0530865040dc44a9cc90270396d7c5bcac8f93`](https://arcscan.app/address/0x7b0530865040dc44a9cc90270396d7c5bcac8f93) | Business invoices and bills: payee, amount and document fixed when booked, paid once. |

## Wallets

| Wallet | Address | Role |
|---|---|---|
| Boss | [`{{boss}}`](https://arcscan.app/address/{{boss}}) | Owns the vault. A human's wallet, outside the server's keys. Co-signs anything above the CFO's limits. |
| CFO | [`{{cfo}}`](https://arcscan.app/address/{{cfo}}) | The vault's CFO key and the escrow's operator. Signs the decision log. |
| Treasury | [`{{deployer}}`](https://arcscan.app/address/{{deployer}}) | Deployed the contracts. Funded the first agents' Gateway balances. |

## Agent wallets

| Agent | Address |
|---|---|
| Scout | [`{{agents.scout}}`](https://arcscan.app/address/{{agents.scout}}) |
| Researcher | [`{{agents.researcher}}`](https://arcscan.app/address/{{agents.researcher}}) |
| Reader | [`{{agents.reader}}`](https://arcscan.app/address/{{agents.reader}}) |
| Writer | [`{{agents.writer}}`](https://arcscan.app/address/{{agents.writer}}) |
| Designer | [`{{agents.illustrator}}`](https://arcscan.app/address/{{agents.illustrator}}) |
| Producer | [`{{agents.producer}}`](https://arcscan.app/address/{{agents.producer}}) |
| Investigator | [`{{agents.investigator}}`](https://arcscan.app/address/{{agents.investigator}}) |
| Analyst | [`{{agents.analyst}}`](https://arcscan.app/address/{{agents.analyst}}) |
| Auditor | [`{{agents.auditor}}`](https://arcscan.app/address/{{agents.auditor}}) |
| Messenger | [`{{agents.messenger}}`](https://arcscan.app/address/{{agents.messenger}}) |

Every agent is registered in the vault, which is what lets the CFO top it up.

## Arc and Circle

| | |
|---|---|
| Network | Arc mainnet, chain id 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | [arcscan.app](https://arcscan.app) |
| USDC | `{{usdc}}` (6 decimals through ERC-20; also Arc's gas token) |
| Circle GatewayWallet | `{{gatewayWallet}}` |

## Key transactions

| Event | Transaction |
|---|---|
| SynclyVault deployed | [{{txs.deploySynclyVault}}](https://arcscan.app/tx/{{txs.deploySynclyVault}}) |
| JobEscrow deployed | [{{txs.deployJobEscrow}}](https://arcscan.app/tx/{{txs.deployJobEscrow}}) |
| Vault handed to the Boss | [{{txs.setOwner→boss}}](https://arcscan.app/tx/{{txs.setOwner→boss}}) |
| The CFO's first weekly plan sealed on-chain | [0x8af07f69…](https://arcscan.app/tx/0x8af07f69b1c058e51379bbab8c31f3f419a110fd5dc2174988a566dfb4f158d4) |

Every tool payment's settlement transaction is linked from its job page and from the [traction report](/api/traction.md).
