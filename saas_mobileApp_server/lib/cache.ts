import { redis } from './redis';

// Cache TTL constants in seconds
export const CACHE_TTL = {
  HOT: 60, // 60 seconds
  WARM: 15 * 60, // 15 minutes
  LONG: 24 * 60 * 60, // 24 hours
};

/**
 * Fetch data from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<T>(key);
    return data;
  } catch (error) {
    console.error(`[Redis] Error fetching cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Set data to cache with a TTL
 */
export async function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL.HOT): Promise<void> {
  try {
    await redis.set(key, data, { ex: ttl });
  } catch (error) {
    console.error(`[Redis] Error setting cache for key ${key}:`, error);
  }
}

/**
 * Delete a specific cache key
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`[Redis] Error deleting cache for key ${key}:`, error);
  }
}

/**
 * Invalidate multiple cache keys using a pattern
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    // Note: Upstash Redis over REST has limited support for keys/scan. 
    // We fetch matching keys first and then delete them.
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`[Redis] Error invalidating pattern ${pattern}:`, error);
  }
}
