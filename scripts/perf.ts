/**
 * H10 perf pass: cold start and idle memory of the built app (CODEX_HANDOFF §13.3).
 *
 *   npm run build && npm run perf
 *
 * Launches dist/main through Playwright's Electron driver with throwaway data and Handpost folders
 * (HANDPOST_DATA_DIR / HANDPOST_FOLDER / HANDPOST_QUIET: no legacy import, toasts or login items, nothing to
 * publish), waits for the Inbox heading, lets the app sit idle for a few seconds, then reports timings and the
 * summed working set of every Electron process. Runs three times and prints the median.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

interface Sample {
  windowMs: number;
  inboxMs: number;
  idleWorkingSetMb: number;
  processes: number;
  /** Working set per Electron process type, MB. */
  byType: Record<string, number>;
  /** The main process's own V8 heap and Node `external` memory, MB. */
  mainHeapMb: number;
  mainExternalMb: number;
}

async function sample(): Promise<Sample> {
  const dataDir = await mkdtemp(join(tmpdir(), 'handpost-perf-data-'));
  const folder = await mkdtemp(join(tmpdir(), 'handpost-perf-folder-'));
  const env: Record<string, string | undefined> = {
    ...process.env,
    HANDPOST_DATA_DIR: dataDir,
    HANDPOST_FOLDER: folder,
    HANDPOST_QUIET: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const started = performance.now();
  const app = await electron.launch({ args: ['.'], env: env as Record<string, string> });
  try {
    const window = await app.firstWindow();
    const windowMs = performance.now() - started;
    await window.getByRole('heading', { level: 1, name: 'Inbox', exact: true }).waitFor({ timeout: 60_000 });
    const inboxMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const metrics = await app.evaluate(({ app: electronApp }) =>
      electronApp.getAppMetrics().map((metric) => ({ type: metric.type, kb: metric.memory.workingSetSize })),
    );
    const main = await app.evaluate(() => {
      const usage = process.memoryUsage();
      return { heap: usage.heapUsed, external: usage.external };
    });
    const byType: Record<string, number> = {};
    for (const metric of metrics)
      byType[metric.type] = Math.round((byType[metric.type] ?? 0) + metric.kb / 1024);
    return {
      windowMs: Math.round(windowMs),
      inboxMs: Math.round(inboxMs),
      idleWorkingSetMb: Math.round(metrics.reduce((sum, metric) => sum + metric.kb, 0) / 1024),
      processes: metrics.length,
      byType,
      mainHeapMb: Math.round(main.heap / 1_048_576),
      mainExternalMb: Math.round(main.external / 1_048_576),
    };
  } finally {
    await app.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
    await rm(folder, { recursive: true, force: true, maxRetries: 5 });
  }
}

const samples: Sample[] = [];
for (let run = 0; run < 3; run++) samples.push(await sample());
const median = (key: 'windowMs' | 'inboxMs' | 'idleWorkingSetMb' | 'processes') =>
  [...samples.map((item) => item[key])].sort((a, b) => a - b)[1]!;
console.log(JSON.stringify({ samples }, null, 2));
console.log(
  `Perf (median of 3): first window ${median('windowMs')} ms · Inbox rendered ${median('inboxMs')} ms · ` +
    `idle working set ${median('idleWorkingSetMb')} MB across ${median('processes')} processes`,
);
