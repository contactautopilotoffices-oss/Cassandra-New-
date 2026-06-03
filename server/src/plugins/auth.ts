import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const fmsSupabaseUrl = process.env.FMS_SUPABASE_URL!;
const fmsAnonKey = process.env.FMS_SUPABASE_ANON_KEY!;

export function createAuthenticatedClient(jwt: string) {
  return createClient(fmsSupabaseUrl, fmsAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });
}

export const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      reply.status(401);
      return reply.send({ error: 'unauthorized', message: 'Invalid Authorization header format' });
    }
    const token = parts[1];
    request.supabase = createAuthenticatedClient(token);
  });
};
