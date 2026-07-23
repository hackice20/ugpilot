import type { Context } from "grammy";
import { getUserProfile, upsertUserProfile } from "@ugpilot/db";
import { getTelegramUserId } from "../../lib/telegram-user.js";

export async function handleProfileCommand(ctx: Context): Promise<void> {
  const userId = getTelegramUserId(ctx);
  if (!userId) return;

  const raw = (ctx.match?.toString() ?? "").trim();

  if (!raw || raw === "show") {
    await showProfile(ctx, userId);
    return;
  }

  if (raw.startsWith("set ")) {
    await setProfile(ctx, userId, raw.slice(4));
    return;
  }

  await ctx.reply(
    "Usage:\n/profile show\n/profile set name=... | role=... | blurb=...",
  );
}

async function showProfile(ctx: Context, userId: number): Promise<void> {
  const profile = await getUserProfile(userId);
  if (!profile) {
    await ctx.reply(
      "No profile yet.\n/profile set name=Your Name | role=Product Engineer | blurb=I built X, Y, Z",
    );
    return;
  }

  await ctx.reply(
    [
      `Name: ${profile.display_name ?? "-"}`,
      `Role: ${profile.target_role ?? "-"}`,
      `Blurb:\n${profile.resume_blurb ?? "-"}`,
    ].join("\n"),
  );
}

async function setProfile(
  ctx: Context,
  userId: number,
  body: string,
): Promise<void> {
  const parts = Object.fromEntries(
    body.split("|").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k?.trim().toLowerCase(), rest.join("=").trim()];
    }),
  ) as Record<string, string>;

  const profile = await upsertUserProfile({
    telegramUserId: userId,
    displayName: parts.name,
    targetRole: parts.role,
    resumeBlurb: parts.blurb,
  });

  await ctx.reply(
    `Profile saved.\nName: ${profile.display_name}\nRole: ${profile.target_role}`,
  );
}
