import type { Action } from "@withone/sdk";
import { DRY_RUN, connections, live, oneClient, type Platform } from "./config.js";

/**
 * Every platform call in this repo goes through here, and through One. There
 * is no direct Shopify, Higgsfield, Google or Slack HTTP anywhere.
 *
 * One function, three behaviours:
 *   live      the platform's keys are set: run the action via @withone/sdk
 *   fixture   no keys: return the recorded response from fixtures/
 *   dry-run   print the action id, method, path and payload, then return the
 *             fixture so the rest of the plan can be printed too
 *
 * The recorded response replaces the wire, never the code: parsing, polling
 * and validation run the same way on both.
 */
export interface OneCall {
  platform: Platform;
  /** Short human label for the run log. */
  label: string;
  /** The action's id in One's catalog (conn_mod_def::...). */
  systemId: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: Buffer;
  /** The recorded response, used when the platform is not live. */
  fixture?: () => unknown;
}

/**
 * Platforms with a typed module in @withone/sdk (Slack here) run the typed
 * action instead of raw passthrough. Same three behaviours.
 */
export async function oneTyped(
  platform: Platform,
  label: string,
  action: Action<unknown>,
): Promise<unknown> {
  const r = action.request;
  if (DRY_RUN || !live[platform]) {
    return oneCall({
      platform,
      label,
      systemId: r.systemId,
      method: r.method as OneCall["method"],
      path: r.path,
      query: r.query as OneCall["query"],
      body: r.body,
    });
  }
  const res = await oneClient().connection(connections[platform]()).run(action);
  return res.data;
}

export const planned: OneCall[] = [];

function summarize(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 260 ? `${text.slice(0, 257)}...` : text;
}

function printPlan(call: OneCall): void {
  const path = Object.entries(call.pathParams ?? {}).reduce(
    (p, [k, v]) => p.replace(`{{${k}}}`, v),
    call.path,
  );
  console.log(`   [dry-run] ${call.platform}: ${call.label}`);
  console.log(`             ${call.method} ${path}  (${call.systemId})`);
  if (call.query) console.log(`             query ${summarize(call.query)}`);
  if (call.body !== undefined) console.log(`             body  ${summarize(call.body)}`);
  if (call.rawBody) console.log(`             body  <${call.rawBody.length} bytes, ${call.headers?.["Content-Type"] ?? "binary"}>`);
}

export function isLive(platform: Platform): boolean {
  return live[platform];
}

export async function oneCall(call: OneCall): Promise<unknown> {
  if (DRY_RUN) {
    planned.push(call);
    printPlan(call);
    return call.fixture?.();
  }
  if (!live[call.platform]) {
    if (!call.fixture) {
      throw new Error(`${call.platform} is not configured and "${call.label}" has no fixture.`);
    }
    return call.fixture();
  }
  const res = await oneClient()
    .connection(connections[call.platform]())
    .runRaw({
      systemId: call.systemId,
      method: call.method,
      path: call.path,
      pathParams: call.pathParams,
      query: call.query,
      body: call.body,
      headers: call.headers,
      rawBody: call.rawBody,
    });
  return res.data;
}
