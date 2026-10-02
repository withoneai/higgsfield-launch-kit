import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function runDir(handle: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(ROOT, "out", `${stamp}-${handle}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function extFor(url: string, fallback: string): string {
  const ext = extname(new URL(url, "file:///").pathname).toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
}

/**
 * Keep a local copy of every finished asset, so the run folder is a complete
 * record and the Drive upload has bytes to send. Generated media comes back
 * as a CDN URL (a file download, not a platform API call); recorded media is
 * a path under fixtures/ and is copied.
 */
export async function saveMedia(url: string, dest: string): Promise<string> {
  mkdirSync(dirname(dest), { recursive: true });
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  } else {
    copyFileSync(join(ROOT, url), dest);
  }
  return dest;
}

/** Where a recorded (repo-relative) media path lives on disk. */
export function repoPath(url: string): string {
  return join(ROOT, url);
}

export function writeJson(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return path;
}
