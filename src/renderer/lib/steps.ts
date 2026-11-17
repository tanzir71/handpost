import type { StepLogEntry } from '../ui';

export function parseSteps(json: string | null | undefined): StepLogEntry[] {
  try {
    const value = JSON.parse(String(json ?? '[]'));
    return Array.isArray(value) ? (value as StepLogEntry[]) : [];
  } catch {
    return [];
  }
}
