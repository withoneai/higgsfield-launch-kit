import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DRY_RUN, live, loadFixture } from "./config.js";
import { ShotListSchema, type Product, type ShotList } from "./types.js";

async function fromClaude(brand: string, product: Product): Promise<unknown> {
  const client = new Anthropic();
  const prompt = `You are the art director for a small brand's product launch. Plan the launch assets for one new product: three still images and one short video.

## The brand brief (follow it to the letter)

${brand}

## The product

Title: ${product.title}
Description: ${product.description}
The real product photo is attached to every generation as the reference image, so the model sees the actual packaging.

## What to return

- product_read: one sentence on what this product is and what the assets must get across.
- stills: exactly three, one of each id:
  - studio: a clean catalog shot for the product page.
  - lifestyle: the product in a believable scene where it gets used.
  - hero: a wide banner image with clear empty space for a headline.
  For each, name it, say where it will be used (from the brief), pick an aspect_ratio that fits that placement, pick a model, and write the generation prompt.
  - model "nano-banana" composes a NEW scene around the reference photo and honours aspect_ratio. Use it for anything that needs a different setting or framing.
  - model "reve-edit" EDITS the reference photo in place and keeps its framing; aspect_ratio is ignored. Use it only when the product photo's own framing is right and it needs a cleaner background or better light.
  - prompt: written for an image model, concrete and visual: subject, surface, props, light direction, lens feel, palette (use the brief's colors by name). Always say to keep the packaging, label text and logo exactly as in the reference image. Put the brief's "never" items into the prompt as things to avoid.
- motion: one 5-second image-to-video move that will be applied to whichever still wins. Describe a subtle camera or light move that keeps the product still and undistorted. negative_prompt lists what must not happen (warping label, morphing logo, plus the brief's never-list).

Style for every field: no em dashes or en dashes. Use commas, periods, colons or parentheses.`;

  const res = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ShotListSchema) },
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined to write the shot list.");
  if (!res.parsed_output) throw new Error("Claude returned a shot list that did not match the schema.");
  return res.parsed_output;
}

/**
 * The gate after the model, in code. The schema already pins the shape; this
 * checks what a schema cannot: one shot of each kind, and that a reve-edit
 * shot is not quietly promising an aspect ratio the model will ignore.
 */
export function gateShotList(list: ShotList): { list: ShotList; warnings: string[] } {
  const ids = new Set(list.stills.map((s) => s.id));
  if (ids.size !== 3) {
    throw new Error(`The shot list must have one studio, one lifestyle and one hero shot, got: ${list.stills.map((s) => s.id).join(", ")}.`);
  }
  const warnings = list.stills
    .filter((s) => s.model === "reve-edit" && s.aspect_ratio !== "1:1")
    .map((s) => `${s.id}: reve-edit keeps the source framing, so the planned ${s.aspect_ratio} is advisory only`);
  return { list, warnings };
}

export async function writeShotList(
  brand: string,
  product: Product,
): Promise<{ list: ShotList; warnings: string[]; source: "claude" | "fixture" }> {
  const useClaude = live.claude && !DRY_RUN;
  const raw = useClaude ? await fromClaude(brand, product) : loadFixture("claude/shotlist.json");
  return { ...gateShotList(ShotListSchema.parse(raw)), source: useClaude ? "claude" : "fixture" };
}
