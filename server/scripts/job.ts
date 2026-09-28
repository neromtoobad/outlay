// node scripts/job.ts <service> "brief"
// OUTLAY_DRY=1 node scripts/job.ts <service> "..."   (no payments, fixture data)
import { SERVICES } from '../src/services/index.ts';
import { DRY } from '../src/config.ts';

const [id, ...words] = process.argv.slice(2);
const svc = SERVICES[id as keyof typeof SERVICES];
if (!svc || !words.length) {
  console.log(`usage: node scripts/job.ts <${Object.keys(SERVICES).join('|')}> "brief"`);
  process.exit(1);
}
console.log(`\n${svc.name}${DRY ? ' (DRY RUN: no money moves)' : ''}\nbrief: ${words.join(' ')}\n`);
const job = await svc.run(words.join(' '));
console.log(`\n${job.status.toUpperCase()} ${job.id}  tools ${job.receipt.length} calls, ${job.spentUsd().toFixed(4)} USDC  price ${svc.priceUsd} USDC  margin ${(svc.priceUsd - job.spentUsd()).toFixed(2)}`);
console.log(`QA (${job.qa?.model ?? '-'}): ${job.qa?.verdict ?? '-'} ${job.qa?.notes ? '· ' + job.qa.notes : ''}`);
if (job.error) console.log(`error: ${job.error}`);
console.log(`saved → ${job.dir()}`);
