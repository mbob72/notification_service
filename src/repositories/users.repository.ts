import { eq } from 'drizzle-orm';
import { db } from '../db';
import { regions, users } from '../db/schema';

export type UserRecord = {
  id: string;
  timezone: string;
  regionId: string;
  regionCode: string;
};

export type RegionRecord = {
  id: string;
  code: string;
};

export class UsersRepository {
  async findById(userId: string): Promise<UserRecord | null> {
    const [row] = await db
      .select({
        id: users.id,
        timezone: users.timezone,
        regionId: users.regionId,
        regionCode: regions.code,
      })
      .from(users)
      .innerJoin(regions, eq(users.regionId, regions.id))
      .where(eq(users.id, userId))
      .limit(1);

    return row ?? null;
  }

  async findRegionByCode(code: string): Promise<RegionRecord | null> {
    const [row] = await db
      .select({
        id: regions.id,
        code: regions.code,
      })
      .from(regions)
      .where(eq(regions.code, code))
      .limit(1);

    return row ?? null;
  }
}
