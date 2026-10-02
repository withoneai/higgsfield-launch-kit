import { createInterface } from "node:readline/promises";
import { DRY_RUN, YES } from "./config.js";
import { isLive } from "./one.js";

/**
 * The credit guard. Higgsfield bills per generation, and a pipeline that can
 * spend money on its own should say what it is about to spend and wait. It
 * passes with --yes, or with a typed "y" at an interactive prompt. Anything
 * else (a cron job, CI, a piped run without --yes) stops before the spend.
 *
 * Prices change and depend on your Higgsfield plan, so this prints the units
 * (which model, how many generations, how many seconds) rather than guessing
 * a dollar figure. Check them against your console before confirming.
 */
export async function confirmSpend(lines: string[]): Promise<boolean> {
  if (DRY_RUN || !isLive("higgsfield")) {
    console.log("   planned spend (recorded generations, so 0 credits this run):");
    for (const l of lines) console.log(`     - ${l}`);
    return true;
  }
  console.log("   planned Higgsfield spend:");
  for (const l of lines) console.log(`     - ${l}`);
  console.log("     prices: https://console.higgsfield.ai (they depend on your plan)");
  if (YES) {
    console.log("   --yes given, going ahead.");
    return true;
  }
  if (!process.stdin.isTTY) {
    console.log("   Not confirmed: rerun with --yes to spend credits non-interactively.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("   Spend these credits? [y/N] ");
  rl.close();
  return answer.trim().toLowerCase().startsWith("y");
}
