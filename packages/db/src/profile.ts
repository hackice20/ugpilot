import { getPool } from "./client.js";

export type UserProfileRow = {
  telegram_user_id: string;
  display_name: string | null;
  target_role: string | null;
  resume_blurb: string | null;
  updated_at: Date;
};

export async function upsertUserProfile(input: {
  telegramUserId: number;
  displayName?: string;
  targetRole?: string;
  resumeBlurb?: string;
}): Promise<UserProfileRow> {
  const pool = getPool();
  const { rows } = await pool.query<UserProfileRow>(
    `
    INSERT INTO user_profiles (telegram_user_id, display_name, target_role, resume_blurb)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (telegram_user_id) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
      target_role  = COALESCE(EXCLUDED.target_role, user_profiles.target_role),
      resume_blurb = COALESCE(EXCLUDED.resume_blurb, user_profiles.resume_blurb),
      updated_at   = NOW()
    RETURNING *
    `,
    [
      input.telegramUserId,
      input.displayName ?? null,
      input.targetRole ?? null,
      input.resumeBlurb ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to upsert user profile");
  return row;
}

export async function getUserProfile(
  telegramUserId: number,
): Promise<UserProfileRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserProfileRow>(
    `SELECT * FROM user_profiles WHERE telegram_user_id = $1`,
    [telegramUserId],
  );
  return rows[0] ?? null;
}
