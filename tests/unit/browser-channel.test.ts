import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserCandidates, resolveBrowserChannel } from '../../src/main/engine/browser';

const windowsEnv = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' };
const edgePath = join('C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const chromePath = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');

describe('browser channel selection', () => {
  it('honours an explicit HANDPOST_BROWSER choice', () => {
    expect(resolveBrowserChannel('msedge', () => false)).toBe('msedge');
    expect(resolveBrowserChannel('chromium', () => true)).toBe('chromium');
  });

  it('prefers installed Chrome, then Edge', () => {
    expect(resolveBrowserChannel(undefined, path => path === chromePath || path === edgePath, windowsEnv, 'win32')).toBe('chrome');
    expect(resolveBrowserChannel(undefined, path => path === edgePath, windowsEnv, 'win32')).toBe('msedge');
  });

  it('ignores unknown values and falls back to Chrome when nothing is detected', () => {
    expect(resolveBrowserChannel('firefox', () => false, windowsEnv, 'win32')).toBe('chrome');
  });

  it('knows where Edge lives on each platform', () => {
    expect(browserCandidates('msedge', windowsEnv, 'win32')).toContain(edgePath);
    expect(browserCandidates('msedge', {}, 'darwin')).toEqual(['/Applications/Microsoft Edge.app']);
    expect(browserCandidates('chrome', {}, 'linux')).toContain('/usr/bin/google-chrome');
  });
});
