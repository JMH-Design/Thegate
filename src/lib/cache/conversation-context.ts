import { Redis } from "@upstash/redis";

const TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_MESSAGES = 20;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export interface CachedMessage {
  id: string;
  role: string;
  content: string;
  parts?: Array<{ type: string; text?: string }>;
}

export async function getCachedMessages(
  sessionId: string
): Promise<CachedMessage[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const key = `conv:${sessionId}`;
    const data = await redis.get<string>(key);
    if (!data) return null;
    const parsed = JSON.parse(data) as CachedMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setCachedMessages(
  sessionId: string,
  messages: CachedMessage[],
  ttl = TTL_SECONDS
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = `conv:${sessionId}`;
    const trimmed = messages.slice(-MAX_MESSAGES);
    await redis.setex(key, ttl, JSON.stringify(trimmed));
  } catch {
    /* ignore cache write errors */
  }
}

export async function clearCachedMessages(sessionId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`conv:${sessionId}`);
  } catch {
    /* ignore */
  }
}
