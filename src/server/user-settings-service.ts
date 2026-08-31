import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { userSettings } from './db/schema.ts';

export const userSettingsPatch = z.object({
  showCollectionGaps: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one setting is required' });

export type UserSettingsPatch = z.infer<typeof userSettingsPatch>;

export class UserSettingsService {
  constructor(private readonly db: Database) {}

  async get(userId: string) {
    return this.ensureSettings(userId);
  }

  async update(userId: string, patch: UserSettingsPatch) {
    const change = userSettingsPatch.parse(patch);
    await this.ensureSettings(userId);
    const [settings] = await this.db.update(userSettings).set({ ...change, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId)).returning();
    return settings!;
  }

  private async ensureSettings(userId: string) {
    const [created] = await this.db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    const [settings] = await this.db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return settings!;
  }
}
