import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Each test fork is an Electron-as-Node process (better-sqlite3 is built for Electron). On Windows those can
// take longer than tinypool's default to shut down under a full parallel run, so allow a generous teardown.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      teardownTimeout: 60_000,
      pool: 'forks',
    },
  }),
);
