import { Redis } from '@upstash/redis';

// Use environment variables for the Upstash Redis REST URL and Token.
// Make sure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in your environment or Vercel.

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});
