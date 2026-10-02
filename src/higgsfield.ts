import { DRY_RUN, loadFixture } from "./config.js";
import { isLive, oneCall } from "./one.js";
import type { Shot } from "./types.js";

/**
 * Higgsfield has no typed module in the One SDK, so every call is raw
 * passthrough by catalog id (platform slug `higgsfield-ai`). Every model here
 * takes the real product photo as input. The text-to-image models (Flux
 * Kontext Max text-to-image, Reve text-to-image) do not, so they would invent
 * a different bag, which is why they are not used.
 */
export const ACTIONS = {
  "nano-banana": {
    systemId: "conn_mod_def::GLMJlkVhLik::ELbDTgsMRuC82s7SV_PI-Q", // Nano Banana Generation
    path: "/nano-banana",
  },
  "reve-edit": {
    systemId: "conn_mod_def::GLMJlsS1eJY::K98LQZWLSVWNBf_7f8iDRA", // Edit Using Reve
    path: "/reve/edit",
  },
  kling: {
    systemId: "conn_mod_def::GLMJlP8QfFM::Cws4xxVyS8CgwkAGMbmuwA", // Image to Video Using Kling Video v2.5 Turbo Standard
    path: "/kling-video/v2.5-turbo/standard/image-to-video",
  },
  status: {
    systemId: "conn_mod_def::GLMJljPc0Ck::kvGINkpWRMSU7aHg_Uy-AA", // Get Generation Status
    path: "/requests/{{requestId}}/status",
  },
} as const;

export const VIDEO_SECONDS = 5;

type Status = "queued" | "in_progress" | "processing" | "nsfw" | "failed" | "completed" | "canceled";
const TERMINAL_FAIL: Status[] = ["nsfw", "failed", "canceled"];

interface Submitted {
  status: Status;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
}

function requireRemoteImage(url: string, what: string): void {
  if (isLive("higgsfield") && !/^https?:\/\//.test(url)) {
    throw new Error(
      `Higgsfield needs a public URL for ${what}, got "${url}". Live generation needs a live product read too (set ONE_CONNECTION_SHOPIFY).`,
    );
  }
}

/**
 * Where the finished media lives. One's docs for Get Generation Status only
 * show `{ id, status }`, so this reads every shape Higgsfield's API is known
 * or likely to use, in order: `images[].url`, `video.url`, `video[].url`,
 * `videos[].url`, a top-level `url`, and the same under `result` / `output`.
 * The first live run will tell you which one it is; see the README.
 */
export function outputUrls(payload: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o.url === "string") urls.push(o.url);
    for (const key of ["images", "video", "videos", "result", "output", "outputs"]) {
      const v = o[key];
      if (Array.isArray(v)) {
        for (const item of v) typeof item === "string" ? urls.push(item) : visit(item);
      } else if (typeof v === "string" && /^https?:\/\//.test(v)) {
        urls.push(v);
      } else {
        visit(v);
      }
    }
  };
  visit(payload);
  return [...new Set(urls)];
}

async function submit(
  label: string,
  action: { systemId: string; path: string },
  body: Record<string, unknown>,
  fixtureId: string,
): Promise<Submitted> {
  const res = (await oneCall({
    platform: "higgsfield",
    label,
    systemId: action.systemId,
    method: "POST",
    path: action.path,
    body,
    fixture: () => ({
      status: "queued",
      request_id: fixtureId,
      status_url: `https://platform.higgsfield.ai/requests/${fixtureId}/status`,
      cancel_url: `https://platform.higgsfield.ai/requests/${fixtureId}/cancel`,
    }),
  })) as Submitted;
  if (!res?.request_id) throw new Error(`Higgsfield accepted "${label}" but returned no request_id.`);
  return res;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll Get Generation Status until the request is terminal. Recorded runs
 * answer "completed" on the first poll, so the loop runs exactly once.
 */
export async function waitFor(
  requestId: string,
  label: string,
  timeoutMs: number,
): Promise<string> {
  const started = Date.now();
  let last = "";
  for (;;) {
    const res = (await oneCall({
      platform: "higgsfield",
      label: `poll ${label}`,
      systemId: ACTIONS.status.systemId,
      method: "GET",
      path: ACTIONS.status.path,
      pathParams: { requestId },
      fixture: () => loadFixture(`higgsfield/status/${requestId}.json`),
    })) as { status?: Status };
    const status = res?.status ?? "queued";
    if (status !== last && isLive("higgsfield")) console.log(`     ${label}: ${status}`);
    last = status;

    if (status === "completed") {
      const urls = outputUrls(res);
      if (!urls.length) {
        throw new Error(
          `${label} completed but no media URL was found in the status response: ${JSON.stringify(res).slice(0, 400)}`,
        );
      }
      return urls[0];
    }
    if (TERMINAL_FAIL.includes(status)) throw new Error(`${label} ended as "${status}".`);
    if (DRY_RUN || !isLive("higgsfield")) {
      throw new Error(`Recorded status for ${label} is "${status}", not completed.`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`${label} still "${status}" after ${Math.round(timeoutMs / 60000)} min. Request id ${requestId}.`);
    }
    await sleep(5000);
  }
}

/** One still: submit with the product photo as reference, wait, return the image URL. */
export async function generateStill(shot: Shot, productImageUrl: string): Promise<string> {
  requireRemoteImage(productImageUrl, "the product photo");
  const body =
    shot.model === "nano-banana"
      ? {
          prompt: shot.prompt,
          aspect_ratio: shot.aspect_ratio,
          num_images: 1,
          output_format: "jpeg",
          // One's docs leave this item schema unresolved; this is Higgsfield's
          // image-URL input shape. If a live run rejects it, see the README.
          input_images: [{ type: "image_url", image_url: productImageUrl }],
        }
      : { prompt: shot.prompt, image_url: productImageUrl, num_images: 1 };
  const sub = await submit(`still "${shot.id}" (${shot.model})`, ACTIONS[shot.model], body, `fixture-${shot.id}`);
  return waitFor(sub.request_id, `still "${shot.id}"`, 6 * 60_000);
}

/** The one video: Kling 2.5 Turbo Standard, image-to-video from the winning still. */
export async function animate(
  stillUrl: string,
  motion: { prompt: string; negative_prompt: string },
): Promise<string> {
  requireRemoteImage(stillUrl, "the winning still");
  const sub = await submit(
    `animate the winner (Kling 2.5 Turbo Standard, ${VIDEO_SECONDS}s)`,
    ACTIONS.kling,
    {
      prompt: motion.prompt,
      image_url: stillUrl,
      duration: VIDEO_SECONDS,
      cfg_scale: 0.5,
      negative_prompt: motion.negative_prompt,
    },
    "fixture-video",
  );
  return waitFor(sub.request_id, "video", 12 * 60_000);
}
