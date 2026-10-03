---
title: Verify it yourself
description: You don't have to take our word for anything. Here's how to check each claim.
group: Build and verify
order: 2
---

The commands below use [Foundry's](https://getfoundry.sh) `cast` and plain `curl`. Set the RPC once:

```bash
export RPC=https://rpc.mainnet.arc.io
```

## A tool payment settled

On any job page, each receipt line ends with **settled on Arc ↗**. That links to the Arc transaction in which Circle Gateway settled the payment, batched with others. The same links are in the [traction report](/api/traction.md).

## The vault's balances

```bash
cast call {{vault}} "balances()(uint256[5])" --rpc-url $RPC
```

The five numbers are OPERATING, TOOLS, BOND, RESERVE and PROMO, in USDC's 6 decimals (1000000 = 1 USDC). They should match the latest vault snapshot in [/api/cfo](/api/cfo).

## The CFO's limits

```bash
cast call {{vault}} "maxMove()(uint256)" --rpc-url $RPC         # most the CFO moves alone
cast call {{vault}} "epochToolBudget()(uint256)" --rpc-url $RPC # weekly cap on agent allowances
cast call {{vault}} "reserveFloor()(uint256)" --rpc-url $RPC
cast call {{vault}} "owner()(address)" --rpc-url $RPC           # the Boss
cast call {{vault}} "cfo()(address)" --rpc-url $RPC
```

## The CFO's decision log

Each entry is hashed with the one before it and signed by the CFO. This script re-checks every entry the API returns:

```js
// node verify-cfo.mjs   (npm i viem)
import { keccak256, toBytes, recoverMessageAddress } from 'viem';
const { decisions } = await (await fetch('https://hiresyncly.site/api/cfo')).json();
let prev;
for (const d of decisions.reverse()) {
  const { hash, sig, ...body } = d;
  const ok = keccak256(toBytes(JSON.stringify(body))) === hash;
  const linked = !prev || body.prev === prev;
  const signer = sig ? await recoverMessageAddress({ message: { raw: hash }, signature: sig }) : 'unsigned';
  console.log(`#${d.n} ${ok ? 'hash ok' : 'HASH MISMATCH'} ${linked ? 'linked' : 'CHAIN BROKEN'} signer ${signer}`);
  prev = hash;
}
```

The signer should be the CFO, `{{cfo}}`. When a decision moved money, its transaction's `reason` field carries the decision's `reasonHash` (shown in the entry's inputs).

## A job's terms

For a paid job, the job page shows the exact terms under **The terms sealed on-chain**. Hash that text and compare it with the escrow:

```bash
cast keccak "<the exact terms text>"
cast call {{escrow}} "jobs(bytes32)(address,uint96,uint96,uint64,uint64,uint64,bool,uint8,bytes32,bytes32)" <escrow id> --rpc-url $RPC
```

The second-to-last value is `specHash` and must match. The escrow id is keccak256 of the order id: `cast keccak <order id>`.

## A Syncly Pay invoice

Every invoice page shows the document sealed on-chain and its hash. Check them against InvoiceBook (`0x7b0530865040dc44a9cc90270396d7c5bcac8f93`):

```bash
cast keccak '<the exact document text>'                      # must equal the docHash on the page
cast call 0x7b0530865040dc44a9cc90270396d7c5bcac8f93 "invoices(bytes32)(address,uint96,address,uint64,uint16,bool,bool,bytes32)" $(cast keccak <invoice id>) --rpc-url $RPC
```

The values are the payee, the amount (6 decimals), the booker (the CFO), the due date, the fee in basis points, paid, cancelled, and the document hash. The payment's transaction carries a `Paid` event with the payer and the fee.

## Which keys the server runs

```bash
curl -s https://hiresyncly.site/api/health
```

`treasury` should be `{{deployer}}`, the address that deployed the contracts.
