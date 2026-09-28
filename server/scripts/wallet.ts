// node scripts/wallet.ts init      → create ~/.outlay-seed if missing (never printed)
// node scripts/wallet.ts status    → addresses + wallet/Gateway USDC balances on Arc mainnet
// node scripts/wallet.ts deposit <role> <usdc>   → move USDC from the role's wallet into its Gateway balance
import { initSeed, account, ROLES, SEED_FILE, type Role } from '../src/wallets.ts';
import { gateway } from '../src/x402.ts';

const [cmd = 'status', ...rest] = process.argv.slice(2);

if (cmd === 'init') {
  const { created } = initSeed();
  console.log(created ? `created ${SEED_FILE} (mode 600). Back it up somewhere safe; it controls every Outlay wallet.` : 'seed already exists; nothing changed');
  process.exit(0);
}

if (cmd === 'status') {
  const roles = (rest.length ? rest : ['treasury', 'cfo', 'scout', 'reader', 'researcher', 'writer', 'auditor']) as Role[];
  for (const role of roles) {
    const addr = account(role).address;
    try {
      const b = await gateway(role).getBalances();
      console.log(`${role.padEnd(12)} #${String(ROLES[role]).padStart(2)} ${addr}  wallet ${b.wallet.formatted.padStart(10)}  gateway ${b.gateway.formattedAvailable.padStart(10)} USDC`);
    } catch (e: any) {
      console.log(`${role.padEnd(12)} #${String(ROLES[role]).padStart(2)} ${addr}  (balance check failed: ${e?.message ?? e})`);
    }
  }
  process.exit(0);
}

if (cmd === 'deposit') {
  const [role, amount] = rest as [Role, string];
  if (!role || !amount) throw new Error('usage: deposit <role> <usdc>');
  const r = await gateway(role).deposit(amount);
  console.log(`deposited ${r.formattedAmount} USDC for ${role}: approve ${r.approvalTxHash ?? '-'} deposit ${r.depositTxHash}`);
  process.exit(0);
}

console.log('commands: init | status [roles...] | deposit <role> <usdc>');
