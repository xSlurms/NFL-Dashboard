/** A failed upstream call. The message names only the status and URL path, so cookies never reach a log or a response. */
export class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(status ? `ESPN returned HTTP ${status} for ${path}` : `ESPN request failed for ${path}`);
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 8_000): Promise<T> {
  const { pathname } = new URL(url);
  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new UpstreamError(0, pathname);
  }
  if (res.status !== 200) throw new UpstreamError(res.status, pathname);
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(0, pathname);
  }
}
