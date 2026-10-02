import "dotenv/config";
import { readFileSync } from "node:fs";
import { One } from "@withone/sdk";

/**
 * Every outside system this kit touches is a "source". Each one is live when
 * its keys are in the environment and replays fixtures/ when they are not.
 * That per-source fallthrough is what makes a fresh clone run end to end with
 * zero credentials: the same pipeline runs, only the data comes from disk.
 *
 * --demo forces every source onto fixtures. --dry-run goes further: no One
 * call executes at all, each one is printed with its action id and payload.
 */
export const argv = process.argv.slice(2);
export const flag = (name: string) => argv.includes(name);
export function option(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i !== -1) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

export const DEMO = flag("--demo");
export const DRY_RUN = flag("--dry-run");
export const YES = flag("--yes");

const env = (name: string) => (DEMO || DRY_RUN ? "" : process.env[name] ?? "");

/** Which sources are live this run. Everything else replays fixtures/. */
export const live = {
  shopify: Boolean(env("ONE_SECRET") && env("ONE_CONNECTION_SHOPIFY")),
  higgsfield: Boolean(env("ONE_SECRET") && env("ONE_CONNECTION_HIGGSFIELD")),
  drive: Boolean(env("ONE_SECRET") && env("ONE_CONNECTION_GOOGLE_DRIVE")),
  slack: Boolean(env("ONE_SECRET") && env("ONE_CONNECTION_SLACK") && env("SLACK_CHANNEL")),
  claude: Boolean(env("ANTHROPIC_API_KEY")),
};

export type Platform = "shopify" | "higgsfield" | "drive" | "slack";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

let client: One | undefined;
export function oneClient(): One {
  client ??= new One(required("ONE_SECRET"));
  return client;
}

export const connections: Record<Platform, () => string> = {
  shopify: () => required("ONE_CONNECTION_SHOPIFY"),
  higgsfield: () => required("ONE_CONNECTION_HIGGSFIELD"),
  drive: () => required("ONE_CONNECTION_GOOGLE_DRIVE"),
  slack: () => required("ONE_CONNECTION_SLACK"),
};

export const slackChannel = () => required("SLACK_CHANNEL");
export const driveParentFolder = () => process.env.DRIVE_PARENT_FOLDER_ID || undefined;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

export function loadFixture(relPath: string): unknown {
  const url = new URL(`../fixtures/${relPath}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    throw new Error(`No fixture at fixtures/${relPath}.`);
  }
}

/** Absolute path of a file under fixtures/, for the recorded media. */
export function fixturePath(relPath: string): string {
  return new URL(`../fixtures/${relPath}`, import.meta.url).pathname;
}

/**
 * brand.md is the whole creative brief, in plain English. The model reads it
 * verbatim, twice: once to write the shot list, once to judge the stills.
 */
export function loadBrand(): string {
  const raw = readFileSync(new URL("../brand.md", import.meta.url), "utf8").trim();
  if (raw.length < 80) {
    throw new Error("brand.md is nearly empty. Describe the brand before generating anything.");
  }
  return raw;
}
