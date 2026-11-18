// Per-browser display preferences (theme, spookiness, sound). These are
// cosmetic only and never affect any rule. Storage can be unavailable in
// some iframes, so every access is guarded.

const KEY = 'ctp-prefs-v1';
export const DEFAULTS = { theme: 'kiroween', level: 'balanced', sound: false };

export function loadPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* keep working without persistence */
  }
}
