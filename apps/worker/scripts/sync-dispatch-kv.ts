import { syncDispatchKvFromDb } from '../src/services/dispatchKvService';

type SyncOptions = {
  dryRun: boolean;
  fullReconcile: boolean;
};

function parseOptions(): SyncOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fullReconcile = !args.includes('--no-reconcile');
  return { dryRun, fullReconcile };
}

async function main() {
  const options = parseOptions();
  console.log('[Dispatch KV] Sync starting', options);

  await syncDispatchKvFromDb({
    dryRun: options.dryRun,
    fullReconcile: options.fullReconcile,
  });

  console.log('[Dispatch KV] Sync complete', options);
}

main().catch((error) => {
  console.error('Dispatch KV sync failed:', error);
  process.exit(1);
});
