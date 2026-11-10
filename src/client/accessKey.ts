// The site's access key, entered once per device and kept in localStorage.
// If storage is blocked (private window), it lasts for this visit only.
const STORAGE_KEY = "football-tracker:access-key";
let memoryKey: string | null = null;
const listeners = new Set<() => void>();
let denied = false;

export function getAccessKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

export function setAccessKey(key: string): void {
  memoryKey = key;
  denied = false;
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // memory only
  }
  emit();
}

export function clearAccessKey(): void {
  memoryKey = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing stored
  }
}

/** Called when the server answers 401: the page shows the key prompt. */
export function reportAccessDenied(): void {
  if (denied) return;
  denied = true;
  emit();
}

export const isAccessDenied = () => denied;

export function subscribeAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}
