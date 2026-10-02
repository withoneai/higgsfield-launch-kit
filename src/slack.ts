import * as slack from "@withone/sdk/slack";
import { DRY_RUN, slackChannel } from "./config.js";
import { oneTyped } from "./one.js";
import type { Pick, ShotList } from "./types.js";

export interface SummaryInput {
  productTitle: string;
  list: ShotList;
  pick?: Pick;
  stillLinks: { id: string; link: string; ok: boolean; error?: string }[];
  videoLink?: string;
  folderLink?: string;
  note?: string;
}

/** One message, for a person who will open Drive next. Slack mrkdwn. */
export function summaryText(s: SummaryInput): string {
  const lines = [`*Launch kit ready for review: ${s.productTitle}*`, "", s.list.product_read, "", "*Shot list*"];
  for (const shot of s.list.stills) {
    const still = s.stillLinks.find((l) => l.id === shot.id);
    const status = still?.ok ? still.link : `failed: ${still?.error ?? "not generated"}`;
    lines.push(`• ${shot.name} (${shot.id}, ${shot.aspect_ratio}, ${shot.model}) for ${shot.use}: ${status}`);
  }
  if (s.pick) {
    lines.push("", `*Pick: ${s.pick.winner}*`, s.pick.reason);
  }
  if (s.videoLink) lines.push("", `*Video (5s):* ${s.videoLink}`);
  if (s.note) lines.push("", `_${s.note}_`);
  if (s.folderLink) lines.push("", `Everything is in Drive: ${s.folderLink}`);
  lines.push("", `Nothing has been published. Review ${s.folderLink ? "in Drive" : "the files above"}, then decide what ships.`);
  return lines.join("\n");
}

export async function postSummary(text: string): Promise<void> {
  const res = await oneTyped(
    "slack",
    "post the review summary",
    slack.sendMessageChannelChatPostmessage({
      body: { channel: DRY_RUN ? "#launches" : slackChannel(), text, unfurl_links: false },
    }),
  );
  const data = res as { ok?: boolean; error?: string } | undefined;
  if (data?.ok === false) throw new Error(`Slack rejected the message: ${data.error}`);
}
