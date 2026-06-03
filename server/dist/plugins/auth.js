"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authPlugin = void 0;
exports.createAuthenticatedClient = createAuthenticatedClient;
const supabase_js_1 = require("@supabase/supabase-js");
const fmsSupabaseUrl = process.env.FMS_SUPABASE_URL;
const fmsAnonKey = process.env.FMS_SUPABASE_ANON_KEY;
function createAuthenticatedClient(jwt) {
    return (0, supabase_js_1.createClient)(fmsSupabaseUrl, fmsAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${jwt}` },
        },
    });
}
const authPlugin = async (fastify) => {
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
exports.authPlugin = authPlugin;
//# sourceMappingURL=auth.js.map