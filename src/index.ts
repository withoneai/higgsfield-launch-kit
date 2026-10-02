import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DEMO, DRY_RUN, flag, live, loadBrand, option } from "./config.js";
import { createFolder, uploadFile, type DriveFile } from "./drive.js";
import { confirmSpend } from "./guard.js";
import { VIDEO_SECONDS, animate, generateStill } from "./higgsfield.js";
import { extFor, repoPath, runDir, saveMedia, writeJson } from "./media.js";
import { isLive, planned } from "./one.js";
import { pickBest } from "./pick.js";
import { readProduct } from "./shopify.js";
import { writeShotList } from "./shotlist.js";
import { postSummary, summaryText } from "./slack.js";
import type { Asset, StillResult } from "./types.js";

if (flag("--help")) {
  console.log(
    [
      "Usage:",
      "  npm start                         newest product in the store",
      "  npm start -- --product <id>       a specific product (numeric id or gid://)",
      "  npm start -- --yes                confirm Higgsfield spend without a prompt",
      "  npm start -- --dry-run            print every planned One call, execute none",
      "  npm start -- --demo               replay fixtures/ even if keys are set",
    ].join("\n"),
  );
  process.exit(0);
}

const src = (on: boolean, what = "live") => (on ? what : "recorded");
const mode = DRY_RUN ? " (dry run: nothing executes)" : DEMO ? " (demo: everything recorded)" : "";
console.log(`── launch kit${mode}\n`);
console.log(
  `   sources: shopify ${src(live.shopify)}, claude ${src(live.claude)}, higgsfield ${src(live.higgsfield)}, ` +
    `drive ${src(live.drive, "live")}, slack ${src(live.slack, "live")}`,
);
if (!DRY_RUN && !Object.values(live).some(Boolean)) {
  console.log("   No keys found, so every source replays fixtures/: a fictional roaster's new");
  console.log("   espresso, a recorded shot list, recorded generations. Same pipeline, same gates.");
  console.log("   Copy .env.example to .env to run it on your store.");
}
console.log("");

try {
  const brand = loadBrand();

  // 1. The product, from Shopify through One.
  console.log("1. product");
  const product = await readProduct(option("--product"));
  console.log(`   ${product.title} (${product.id})`);
  console.log(`   photo: ${product.imageUrl}`);
  const dir = DRY_RUN ? "" : runDir(product.handle);

  // 2-3. The shot list, from Claude reading brand.md verbatim.
  console.log("\n2. shot list");
  const { list, warnings, source: listSource } = await writeShotList(brand, product);
  if (listSource === "fixture") console.log("   [fixture output] recorded shot list, Claude not called");
  console.log(`   ${list.product_read}`);
  for (const s of list.stills) console.log(`   - ${s.id}: ${s.name}, ${s.aspect_ratio} via ${s.model}, for ${s.use}`);
  console.log(`   - motion: ${list.motion.prompt}`);
  for (const w of warnings) console.log(`   ! ${w}`);
  if (dir) writeJson(dir, "shotlist.json", list);

  // 4. Three stills, each conditioned on the real product photo.
  console.log("\n3. stills");
  const stillPlan = list.stills.map((s) => `1 image, ${s.model}, ${s.aspect_ratio} (${s.id})`);
  if (!(await confirmSpend(stillPlan))) {
    console.log(dir ? `\n   Stopped before generating. Shot list saved in ${relative(process.cwd(), dir)}.` : "");
    process.exit(0);
  }
  const results: StillResult[] = await Promise.all(
    list.stills.map(async (shot): Promise<StillResult> => {
      try {
        const url = await generateStill(shot, product.imageUrl);
        const localPath = DRY_RUN
          ? repoPath(url)
          : await saveMedia(url, join(dir, `still-${shot.id}${extFor(url, ".jpg")}`));
        return { shot, ok: true, asset: { id: shot.id, label: shot.name, remoteUrl: url, localPath } };
      } catch (err) {
        return { shot, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  for (const r of results) {
    console.log(r.ok ? `   ✓ ${r.shot.id}: ${r.asset!.remoteUrl}` : `   ✗ ${r.shot.id}: ${r.error}`);
  }
  if (!isLive("higgsfield")) console.log("   [fixture output] recorded generations, Higgsfield not called");
  const stills = results.filter((r) => r.ok).map((r) => r.asset!) as Asset[];
  if (!stills.length) throw new Error("No still finished, so there is nothing to pick or animate.");

  // 5. The decision: Claude looks at the stills and picks one to animate.
  console.log("\n4. pick");
  let pick;
  let pickNote: string | undefined;
  try {
    const picked = await pickBest(brand, product, list, stills);
    pick = picked.pick;
    if (picked.source === "fixture") console.log("   [fixture output] recorded pick, Claude not called");
    console.log(`   winner: ${pick.winner}`);
    console.log(`   why: ${pick.reason}`);
    for (const n of pick.notes) console.log(`   - ${n.id}: ${n.note}`);
    if (dir) writeJson(dir, "pick.json", pick);
  } catch (err) {
    pickNote = err instanceof Error ? err.message : String(err);
    console.log(`   ! ${pickNote}`);
  }

  // 6. Animate only the winner, behind the credit guard.
  let clip: Asset | undefined;
  if (pick) {
    console.log("\n5. video");
    const winner = stills.find((s) => s.id === pick.winner)!;
    const ok = await confirmSpend([`1 video, Kling 2.5 Turbo Standard, ${VIDEO_SECONDS}s, from the "${winner.id}" still`]);
    if (ok) {
      try {
        const url = await animate(winner.remoteUrl, list.motion);
        const localPath = DRY_RUN ? repoPath(url) : await saveMedia(url, join(dir, `video-${winner.id}${extFor(url, ".mp4")}`));
        clip = { id: "video", label: `${winner.id} animated`, remoteUrl: url, localPath };
        console.log(`   ✓ ${url}`);
        if (!isLive("higgsfield")) console.log("   [fixture output] recorded generation");
      } catch (err) {
        pickNote = `Video failed: ${err instanceof Error ? err.message : err}`;
        console.log(`   ✗ ${pickNote}`);
      }
    } else {
      pickNote = "Video skipped: the spend was not confirmed.";
      console.log(`   ${pickNote}`);
    }
  }

  // 7. Save for review: a Drive folder and one Slack message. Nothing public.
  console.log("\n6. review");
  // Demo content never goes to your accounts: outputs are live only when the
  // stills were really generated (or printed, in a dry run).
  const realContent = isLive("higgsfield");
  const links = new Map<string, string>();
  let folder: DriveFile | undefined;
  if ((DRY_RUN || live.drive) && (realContent || DRY_RUN)) {
    folder = await createFolder(`Launch kit: ${product.title} (${new Date().toISOString().slice(0, 10)})`);
    for (const asset of [...stills, ...(clip ? [clip] : [])]) {
      const file = await uploadFile(asset.localPath, folder.id, `${asset.id}${extFor(asset.localPath, "")}`);
      links.set(asset.id, file.webViewLink ?? file.id);
    }
    if (!DRY_RUN) console.log(`   ✓ Drive folder: ${folder.webViewLink}`);
  } else {
    const why = live.drive ? "the stills are recorded, so nothing goes to your Drive" : "Drive not configured";
    console.log(`   Drive skipped (${why}). Files are in ${dir ? relative(process.cwd(), dir) : "(dry run)"}.`);
    for (const asset of [...stills, ...(clip ? [clip] : [])]) {
      links.set(asset.id, dir ? relative(process.cwd(), asset.localPath) : asset.remoteUrl);
    }
  }

  const text = summaryText({
    productTitle: product.title,
    list,
    pick,
    stillLinks: results.map((r) => ({ id: r.shot.id, ok: r.ok, error: r.error, link: links.get(r.shot.id) ?? "" })),
    videoLink: clip ? links.get("video") : undefined,
    folderLink: folder?.webViewLink,
    note: pickNote,
  });
  if (dir) writeFileSync(join(dir, "summary.md"), text + "\n");

  if ((DRY_RUN || live.slack) && (realContent || DRY_RUN)) {
    await postSummary(text);
    if (!DRY_RUN) console.log("   ✓ posted the summary to Slack");
  } else {
    const why = live.slack ? "the stills are recorded" : "Slack not configured";
    console.log(`   Slack skipped (${why}), here is the summary it would post:\n`);
    console.log(text.split("\n").map((l) => `   | ${l}`).join("\n"));
  }

  if (DRY_RUN) {
    console.log(`\n   dry run: ${planned.length} One calls planned, none executed, no credits spent.`);
  } else {
    console.log(`\n   done. Run folder: ${relative(process.cwd(), dir)}`);
    console.log("   Nothing was published to Shopify or anywhere public.");
  }
} catch (err) {
  console.error(`\n   failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
