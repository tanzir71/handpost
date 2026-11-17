import { useEffect } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'handpost.theme';

/** Reads the cached choice so the first paint already has the right theme. */
export function cachedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable; the setting in SQLite stays the source of truth.
  }
}

/** Keeps <html data-theme> in sync with the `theme` setting (System follows the OS). */
export function useTheme(choice: ThemeChoice): void {
  useEffect(() => applyTheme(choice), [choice]);
}
