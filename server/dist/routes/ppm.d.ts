/**
 * PPM Routes — Preventive Maintenance Schedules
 *
 * Covers all endpoints called by saas_mobile_app/services/ppmService.ts:
 *   GET  /api/ppm                   — list schedules
 *   GET  /api/ppm/stats             — aggregate stats
 *   GET  /api/ppm/contracts         — AMC contracts
 *   GET  /api/ppm/search            — asset search
 *   GET  /api/ppm/vendors           — maintenance vendors
 *   POST /api/ppm                   — create schedule
 *   PATCH /api/ppm/:id              — update schedule status / done_date
 *   POST /api/ppm/:id/attachments   — upload attachment URL
 *   DELETE /api/ppm/:id/attachments — remove attachment
 */
import { FastifyInstance } from 'fastify';
export declare function ppmRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=ppm.d.ts.map