import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DRY_RUN, live, loadFixture } from "./config.js";
import { PickSchema, type Asset, type Pick, type Product, type ShotList } from "./types.js";

type ImageBlock = Anthropic.ImageBlockParam;

/** Remote stills go to Claude by URL; recorded ones are read from disk. */
function imageBlock(asset: Asset): ImageBlock {
  if (/^https?:\/\//.test(asset.remoteUrl)) {
    return { type: "image", source: { type: "url", url: asset.remoteUrl } };
  }
  const ext = asset.localPath.split(".").pop()?.toLowerCase();
  const media_type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return {
    type: "image",
    source: { type: "base64", media_type, data: readFileSync(asset.localPath).toString("base64") },
  };
}

async function fromClaude(
  brand: string,
  product: Product,
  list: ShotList,
  stills: Asset[],
): Promise<unknown> {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `You are reviewing three generated launch stills for "${product.title}" against the brand brief below. Only one will be animated into a video, and animation costs real credits, so pick the single best one.

## Brand brief

${brand}

## What each shot was meant to be

${list.stills.map((s) => `- ${s.id} (${s.name}, for ${s.use}): ${s.prompt}`).join("\n")}

The video move that will be applied to the winner: ${list.motion.prompt}

## How to judge

First, disqualify any still where the packaging is wrong: label misspelled, logo redrawn, bag warped. That rule in the brief outranks everything. Then judge fit to the brief (light, palette, props, the never-list), then how well it will survive the planned camera move.

Return the winner's id, the reason in two or three plain sentences (name what you saw in the image, not what the prompt asked for), and one short note per still. No em dashes or en dashes.`,
    },
  ];
  for (const asset of stills) {
    content.push({ type: "text", text: `Still "${asset.id}":` });
    content.push(imageBlock(asset));
  }

  const res = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(PickSchema) },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined to judge the stills.");
  if (!res.parsed_output) throw new Error("Claude returned a pick that did not match the schema.");
  return res.parsed_output;
}

/**
 * The decision that saves credits: only the winner is animated. The gate is
 * mechanical: a winner that is not one of the stills that actually finished
 * is rejected, and nothing gets animated on the strength of it.
 */
export async function pickBest(
  brand: string,
  product: Product,
  list: ShotList,
  stills: Asset[],
): Promise<{ pick: Pick; source: "claude" | "fixture" }> {
  const useClaude = live.claude && !DRY_RUN;
  const raw = useClaude
    ? await fromClaude(brand, product, list, stills)
    : loadFixture("claude/pick.json");
  const pick = PickSchema.parse(raw);
  if (!stills.some((s) => s.id === pick.winner)) {
    throw new Error(
      `The pick names "${pick.winner}", which is not one of the finished stills (${stills.map((s) => s.id).join(", ")}). Nothing will be animated.`,
    );
  }
  return { pick, source: useClaude ? "claude" : "fixture" };
}
