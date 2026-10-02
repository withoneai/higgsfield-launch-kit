import { z } from "zod";

/** The product, reduced to what the shot list needs. */
export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  imageUrl: string;
}

/**
 * The two Higgsfield image models the shot list may choose between. Both take
 * the real product photo as input, which is the point: a text-to-image model
 * would invent a different bag.
 *   nano-banana: reference image plus a scene prompt, honours aspect_ratio.
 *   reve-edit:   edits the photo itself, keeps the source framing (no aspect_ratio).
 */
export const STILL_MODELS = ["nano-banana", "reve-edit"] as const;
export const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "4:3", "3:2", "2:3", "16:9", "9:16", "21:9"] as const;

export const ShotListSchema = z.object({
  product_read: z.string().min(10),
  stills: z
    .array(
      z.object({
        id: z.enum(["studio", "lifestyle", "hero"]),
        name: z.string().min(3),
        use: z.string().min(5),
        model: z.enum(STILL_MODELS),
        aspect_ratio: z.enum(ASPECT_RATIOS),
        prompt: z.string().min(40),
      }),
    )
    .length(3),
  motion: z.object({
    prompt: z.string().min(30),
    negative_prompt: z.string(),
  }),
});
export type ShotList = z.infer<typeof ShotListSchema>;
export type Shot = ShotList["stills"][number];

export const PickSchema = z.object({
  winner: z.enum(["studio", "lifestyle", "hero"]),
  reason: z.string().min(20),
  notes: z.array(z.object({ id: z.enum(["studio", "lifestyle", "hero"]), note: z.string() })),
});
export type Pick = z.infer<typeof PickSchema>;

/** A finished generation: where it lives remotely and on disk. */
export interface Asset {
  id: string;
  label: string;
  remoteUrl: string;
  localPath: string;
}

export interface StillResult {
  shot: Shot;
  ok: boolean;
  asset?: Asset;
  error?: string;
}
