// Open/closed state of the collapsible settings sections, remembered per viewer in localStorage.
// Storage can be missing or throw (private mode, blocked site data): every access is guarded and falls back to open.

export const SECTION_STORAGE_KEY = 'mw.settings.sections';

/** Minimal Storage subset, so tests can pass a fake or null. */
export interface SectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SectionStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Saved closed flags by section id. Unknown or broken data reads as all open. */
export function readClosedSections(storage: SectionStorage | null = defaultStorage()): Record<string, boolean> {
  try {
    const raw = storage?.getItem(SECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) if (v === true) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

/** True when the section is expanded (the default). */
export function isSectionOpen(id: string, storage: SectionStorage | null = defaultStorage()): boolean {
  return readClosedSections(storage)[id] !== true;
}

/** Stores the open state of one section. Fails silently when storage is unavailable. */
export function saveSectionOpen(id: string, open: boolean, storage: SectionStorage | null = defaultStorage()): void {
  try {
    if (!storage) return;
    const closed = readClosedSections(storage);
    if (open) delete closed[id];
    else closed[id] = true;
    storage.setItem(SECTION_STORAGE_KEY, JSON.stringify(closed));
  } catch {
    // Storage blocked or full: the section still toggles for this visit.
  }
}
