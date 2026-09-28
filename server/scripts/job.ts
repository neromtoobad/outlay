// node scripts/job.ts research-brief "brief text"
// OUTLAY_DRY=1 node scripts/job.ts research-brief "..."   (no payments, fixture data)
import { researchBrief } from '../src/services/research-brief.ts';
import { DRY } from '../src/config.ts';

const services = { [researchBrief.id]: researchBrief } as const;
const [id, ...words] = process.argv.slice(2);
const svc = services[id as keyof typeof services];
if (!svc || !words.length) {
  console.log(`usage: node scripts/job.ts <${Object.keys(services).join('|')}> "brief"`);
  process.exit(1);
}
console.log(`\n${svc.name}${DRY ? ' (DRY RUN: no money moves)' : ''}\nbrief: ${words.join(' ')}\n`);
const job = await svc.run(words.join(' '));
console.log(`\n${job.status.toUpperCase()} ${job.id}  tools ${job.receipt.length} calls, ${job.spentUsd().toFixed(4)} USDC  price ${svc.priceUsd} USDC  margin ${(svc.priceUsd - job.spentUsd()).toFixed(2)}`);
console.log(`QA: ${job.qa?.verdict ?? '-'} ${job.qa?.notes ? '· ' + job.qa.notes : ''}`);
console.log(`saved → ${job.dir()}`);
