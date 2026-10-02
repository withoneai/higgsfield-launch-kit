import { live, loadBrand } from "./config.js";
import { oneCall } from "./one.js";
import { readProduct } from "./shopify.js";

/**
 * Proves the run will work before you spend a credit. Every probe is a read:
 * the brand brief parses, Shopify returns the product the kit would use, and
 * Drive answers a one-item folder list. Higgsfield has no free read, so it is
 * only reported as configured; Slack is never posted to here.
 */
let failed = false;
const mark = (ok: boolean, text: string) => console.log(`${ok ? "✓" : "·"} ${text}`);

try {
  const brand = loadBrand();
  mark(true, `brand.md reads (${brand.split("\n").filter((l) => l.startsWith("## ")).length} sections for the model)`);

  if (live.shopify) {
    const p = await readProduct();
    mark(true, `Shopify answers: newest product is "${p.title}", photo ${p.imageUrl.slice(0, 60)}...`);
  } else mark(false, "Shopify not configured: the recorded product will be used");

  if (live.drive) {
    await oneCall({
      platform: "drive",
      label: "list one folder",
      systemId: "conn_mod_def::GJ6Rzy_a8J8::5DPVGp3fTXegRgMN4v11tA", // List Files
      method: "GET",
      path: "/drive/v3/files",
      query: { q: "mimeType='application/vnd.google-apps.folder' and trashed=false", pageSize: 1, fields: "files(id)" },
    });
    mark(true, "Google Drive answers");
  } else mark(false, "Google Drive not configured: assets stay in out/");

  mark(live.higgsfield, live.higgsfield ? "Higgsfield configured (not probed: no free read)" : "Higgsfield not configured: recorded generations will be used");
  mark(live.claude, live.claude ? "Anthropic key set" : "No ANTHROPIC_API_KEY: recorded shot list and pick will be used");
  mark(live.slack, live.slack ? "Slack configured (not posted to by check)" : "Slack not configured: the summary is printed instead");
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
