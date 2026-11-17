import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { access } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/database';
import { BrowserEngine } from '../../src/main/engine/browser';
import { Scheduler } from '../../src/main/scheduler/scheduler';
import { startMockSocial, stopMockSocial } from '../mock-social/server';

let server: Server;
let base: string;
let engine: BrowserEngine | undefined;
beforeAll(async () => {
  server = await startMockSocial();
  base = await mkdtemp(join(tmpdir(), 'handpost-rehearse-e2e-'));
}, 30_000);
afterAll(async () => {
  await engine?.close();
  await stopMockSocial(server);
  await rm(base, { recursive: true, force: true });
});

describe('Rehearse against MockSocial', () => {
  it('fills the real composer and screenshots it, and MockSocial receives nothing', async () => {
    const db = openDatabase();
    db.prepare(
      "INSERT INTO accounts(platform,display_name,profile_dir,status) VALUES ('mock','MockSocial','mock','ok')",
    ).run();
    engine = new BrowserEngine(join(base, 'profiles'), 'chromium');
    const login = await engine.context('mock', { headless: true });
    const page = login.pages()[0] ?? (await login.newPage());
    await page.goto('http://127.0.0.1:4178/');
    await page.locator('[data-handpost="login"] input').fill('owner');
    await Promise.all([
      page.waitForURL('http://127.0.0.1:4178/'),
      page.locator('[data-handpost="login"] button').click(),
    ]);
    await engine.close('mock');
    const scheduler = new Scheduler(db, engine, () => {}, undefined, join(base, 'artifacts'));
    const result = await scheduler.rehearse('mock', {
      text: 'Rehearsal only — must never appear',
      media: [],
      options: {},
    });
    expect(result.outcome, JSON.stringify(result)).toBe('rehearsal');
    expect(result.steps.map((step) => step.name)).toEqual([
      'open composer',
      'fill text',
      'screenshot filled composer',
      'discard draft',
    ]);
    await access(result.screenshotPath!);
    const profile = await (
      await fetch('http://127.0.0.1:4178/profile', { headers: { cookie: 'mock_session=ok' } })
    ).text();
    expect(profile).not.toContain('data-handpost="post"');
    expect(db.prepare('SELECT outcome FROM publish_attempts').pluck().all()).toEqual(['rehearsal']);
    expect(engine.activeContextCount()).toBe(0);
    engine = undefined;
    db.close();
  }, 60_000);
});
