import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';

export function createLocalLogger(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, 'handpost.log');
  const destination = pino.destination({ dest: path, mkdir: true, sync: true });
  const logger = pino(
    {
      base: null,
      redact: {
        paths: [
          'cookie',
          'token',
          'password',
          'authorization',
          '*.cookie',
          '*.token',
          '*.password',
          '*.authorization',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows ACLs inherit from the private app-data directory. */
  }
  return {
    logger,
    path,
    close: () =>
      new Promise<void>((resolve) => {
        destination.once('close', resolve);
        destination.end();
      }),
  };
}
