import { supabase } from '@/utils/supabase/client';

export interface VmsCheckInPayload {
  propertyId: string;
  name: string;
  mobile?: string;
  category: string;
  whom_to_meet: string;
  whom_to_meet_uid?: string;
  purpose?: string;
  coming_from?: string;
  photo_url?: string;
}

export interface PpmUpdatePayload {
  id: string;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  done_date?: string;
  remark?: string;
}

/**
 * Mobile-Native Secure Services
 * Interacts directly with the Supabase client under the authenticated user's RLS policy.
 */
export const mobileServices = {
  // ─── VMS (Visitors) Operations ─────────────────────────────────────────────

  /**
   * Performs visitor check-in securely using the authenticated user session.
   */
  async vmsCheckIn(payload: VmsCheckInPayload) {
    try {
      // 1. Get property details to fetch organization ID
      const { data: property, error: propError } = await (supabase as any)
        .from('properties')
        .select('organization_id')
        .eq('id', payload.propertyId)
        .single();

      if (propError || !property) {
        throw new Error(propError?.message || 'Property not found');
      }

      const organizationId = (property as { organization_id: string }).organization_id;

      // 2. Generate a secure, sequential Visitor ID
      let visitorId = '';
      try {
        const { data: generatedId, error: rpcError } = await (supabase as any)
          .rpc('generate_visitor_id', { p_property_id: payload.propertyId });
        
        if (!rpcError && generatedId) {
          visitorId = generatedId;
        }
      } catch (e) {
        console.warn('generate_visitor_id RPC failed, falling back to random generation', e);
      }

      if (!visitorId) {
        visitorId = `VIS-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      // 3. Insert visitor log
      const { data: visitor, error: insertError } = await (supabase as any)
        .from('visitor_logs')
        .insert({
          property_id: payload.propertyId,
          organization_id: organizationId,
          visitor_id: visitorId,
          category: payload.category,
          name: payload.name,
          mobile: payload.mobile || null,
          coming_from: payload.coming_from || null,
          whom_to_meet: payload.whom_to_meet,
          whom_to_meet_uid: payload.whom_to_meet_uid || null,
          purpose: payload.purpose || null,
          photo_url: payload.photo_url || null,
          checkin_time: new Date().toISOString(),
          status: 'checked_in',
        })
        .select()
        .single();

      if (insertError || !visitor) {
        throw new Error(insertError?.message || 'Failed to create visitor log');
      }

      // 4. Trigger Notifications & WhatsApp Alert securely
      this.triggerVisitorNotifications(visitor, payload.propertyId, organizationId).catch(err =>
        console.error('[VMS] Notification dispatch error:', err)
      );

      return {
        success: true,
        visitorId,
        visitor,
        message: `Welcome ${payload.name}! Visit logged.`,
      };
    } catch (error: any) {
      console.error('[VMS Service] Check-in error:', error);
      throw error;
    }
  },

  /**
   * Helper to fetch recipients and queue alerts for visitor check-in.
   */
  async triggerVisitorNotifications(visitor: any, propertyId: string, organizationId: string) {
    try {
      const recipientIds = new Set<string>();

      // A. Fetch Security and Property Admins
      const { data: members } = await (supabase as any)
        .from('property_memberships')
        .select('user_id')
        .eq('property_id', propertyId)
        .in('role', ['property_admin', 'security']);

      ((members || []) as any[]).forEach((m: any) => recipientIds.add(String(m.user_id)));

      // B. Add Host if UID matches
      if (visitor.whom_to_meet_uid) {
        recipientIds.add(String(visitor.whom_to_meet_uid));
      }

      if (recipientIds.size === 0) return;

      const hostLabel = visitor.whom_to_meet || 'host';
      const notificationTitle = 'Visitor Arrived 🏢';
      const notificationMsg = `${visitor.name} has checked in to meet ${hostLabel}.${visitor.coming_from ? ` Coming from: ${visitor.coming_from}` : ''}`;

      // C. Dispatch in-app notifications
      const notificationRows = Array.from(recipientIds).map(uid => ({
        user_id: uid,
        property_id: propertyId,
        organization_id: organizationId,
        type: 'VISITOR_CHECKED_IN',
        title: notificationTitle,
        message: notificationMsg,
        deep_link: `/property-admin/visitors`,
        status: 'unread',
        created_at: new Date().toISOString(),
      }));

      await (supabase as any).from('notifications').insert(notificationRows);

      // D. Dispatch WhatsApp Queue row if enabled in system_config
      const { data: config } = await (supabase as any)
        .from('system_config')
        .select('value')
        .eq('key', 'whatsapp_notifications_enabled')
        .maybeSingle();

      if (config?.value === true) {
        const { data: users } = await (supabase as any)
          .from('users')
          .select('id, phone')
          .in('id', Array.from(recipientIds));

        const waRows = (users || [])
          .filter((u: any) => u.phone)
          .map((u: any) => ({
            user_id: u.id,
            phone: u.phone,
            message: `*${notificationTitle}*\n\n${notificationMsg}`,
            event_type: 'VISITOR_CHECKED_IN',
            status: 'pending',
            created_at: new Date().toISOString(),
          }));

        if (waRows.length > 0) {
          await (supabase as any).from('whatsapp_queue').insert(waRows);
        }
      }
    } catch (e) {
      console.error('[VMS Service] Failed to trigger notifications:', e);
    }
  },

  /**
   * Performs visitor checkout securely.
   */
  async vmsCheckOut(visitorId: string, propertyId: string) {
    try {
      const { data: visitor, error: findError } = await (supabase as any)
        .from('visitor_logs')
        .select('*')
        .eq('visitor_id', visitorId)
        .eq('property_id', propertyId)
        .single();

      if (findError || !visitor) {
        throw new Error('Visitor log not found');
      }

      if (visitor.status === 'checked_out') {
        return { success: true, message: 'Already checked out', visitor };
      }

      const { data, error } = await (supabase as any)
        .from('visitor_logs')
        .update({
          status: 'checked_out',
          checkout_time: new Date().toISOString(),
        })
        .eq('id', visitor.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        message: `Goodbye ${visitor.name}! Logged out successfully.`,
        visitor: data,
      };
    } catch (error: any) {
      console.error('[VMS Service] Checkout error:', error);
      throw error;
    }
  },

  /**
   * Computes accurate Visitor statistics for the property.
   */
  async vmsFetchTodayStats(propertyId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [{ count: totalToday }, { count: checkedIn }, { count: checkedOut }] = await Promise.all([
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .gte('checkin_time', today.toISOString()),
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('status', 'checked_in')
          .gte('checkin_time', today.toISOString()),
        supabase
          .from('visitor_logs')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', propertyId)
          .eq('status', 'checked_out')
          .gte('checkin_time', today.toISOString()),
      ]);

      return {
        total: totalToday || 0,
        checked_in: checkedIn || 0,
        checked_out: checkedOut || 0,
      };
    } catch (error) {
      console.error('[VMS Service] Fetch stats error:', error);
      return { total: 0, checked_in: 0, checked_out: 0 };
    }
  },

  // ─── PPM (Preventive Maintenance) Operations ────────────────────────────────

  /**
   * Updates a PPM Schedule entry and queues real-time WhatsApp alerts.
   */
  async updatePpmStatus(payload: PpmUpdatePayload, currentUserId: string) {
    try {
      // 1. Fetch existing schedule record
      const { data: existing, error: fetchError } = await (supabase as any)
        .from('ppm_schedules')
        .select('*')
        .eq('id', payload.id)
        .single();

      if (fetchError || !existing) {
        throw new Error(fetchError?.message || 'PPM schedule not found');
      }

      // 2. Perform database update
      const { data: updated, error: updateError } = await (supabase as any)
        .from('ppm_schedules')
        .update({
          status: payload.status,
          done_date: payload.done_date || null,
          remark: payload.remark || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id)
        .select()
        .single();

      if (updateError || !updated) {
        throw new Error(updateError?.message || 'Failed to update schedule status');
      }

      // 3. Dispatch status update notifications if status actually changed
      if (existing.status !== payload.status) {
        this.triggerPpmNotifications(updated, existing.status, currentUserId).catch(err =>
          console.error('[PPM] Status alert error:', err)
        );
      }

      return { success: true, schedule: updated };
    } catch (error: any) {
      console.error('[PPM Service] Update status error:', error);
      throw error;
    }
  },

  /**
   * Gathers recipients and queues alerts for PPM updates.
   */
  async triggerPpmNotifications(schedule: any, previousStatus: string, updatedByUserId: string) {
    try {
      const recipientIds = new Set<string>();

      // A. Org super admins
      const { data: orgAdmins } = await (supabase as any)
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', schedule.organization_id)
        .in('role', ['org_super_admin', 'owner', 'admin', 'org_admin'])
        .neq('is_active', false);

      (orgAdmins || []).forEach((m: any) => recipientIds.add(String(m.user_id)));

      // B. Property admins
      if (schedule.property_id) {
        const { data: propAdmins } = await (supabase as any)
          .from('property_memberships')
          .select('user_id')
          .eq('property_id', schedule.property_id)
          .eq('role', 'property_admin')
          .eq('is_active', true);

        (propAdmins || []).forEach((m: any) => recipientIds.add(String(m.user_id)));
      }

      if (recipientIds.size === 0) return;

      // C. Get updater's full name
      const { data: updater } = await (supabase as any)
        .from('users')
        .select('full_name')
        .eq('id', updatedByUserId)
        .single();

      const updaterName = updater?.full_name || 'A team member';

      const emoji: Record<string, string> = {
        done: '✅',
        postponed: '⏸️',
        skipped: '⏭️',
        pending: '⏳',
      };
      const statusEmoji = emoji[schedule.status] || '📋';
      const plannedLabel = new Date(schedule.planned_date + 'T12:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const messageContent = [
        `${statusEmoji} *PPM Task Updated*`,
        ``,
        `📋 *${schedule.system_name}*${schedule.detail_name ? ` — ${schedule.detail_name}` : ''}`,
        schedule.scope_of_work ? `🔧 ${schedule.scope_of_work}` : '',
        schedule.location ? `📍 ${schedule.location}` : '',
        `📅 Planned: ${plannedLabel}`,
        ``,
        `📊 Status: *${previousStatus.toUpperCase()}* → *${schedule.status.toUpperCase()}*`,
        schedule.done_date ? `✅ Completed on: ${new Date(schedule.done_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '',
        schedule.remark ? `💬 Remark: "${schedule.remark}"` : '',
        ``,
        `👤 Updated by: ${updaterName}`,
      ].filter(Boolean).join('\n');

      // D. Dispatch in-app notifications
      const notifRows = Array.from(recipientIds).map(uid => ({
        user_id: uid,
        property_id: schedule.property_id,
        organization_id: schedule.organization_id,
        type: 'PPM_STATUS_UPDATE',
        title: 'PPM Task Updated',
        message: `${schedule.system_name} updated to ${schedule.status.toUpperCase()}`,
        deep_link: `/property/${schedule.property_id}/ppm`,
        status: 'unread',
        created_at: new Date().toISOString(),
      }));

      await (supabase as any).from('notifications').insert(notifRows);

      // E. Queue WhatsApp enqueues
      const { data: config } = await (supabase as any)
        .from('system_config')
        .select('value')
        .eq('key', 'whatsapp_notifications_enabled')
        .maybeSingle();

      if (config?.value === true) {
        const { data: users } = await (supabase as any)
          .from('users')
          .select('id, phone')
          .in('id', Array.from(recipientIds));

        const waRows = (users || [])
          .filter((u: any) => u.phone)
          .map((u: any) => ({
            user_id: u.id,
            phone: u.phone,
            message: messageContent,
            event_type: 'PPM_STATUS_UPDATE',
            status: 'pending',
            created_at: new Date().toISOString(),
          }));

        if (waRows.length > 0) {
          await (supabase as any).from('whatsapp_queue').insert(waRows);
        }
      }
    } catch (e) {
      console.error('[PPM Service] Failed to trigger notifications:', e);
    }
  },

  // ─── SOP (Checklist) Operations ─────────────────────────────────────────────

  async updateSOPChecklistItem(propertyId: string, completionId: string, completionItemId: string, updates: any) {
    // TODO: sop_completion_items does not exist in saas_one schema
    console.warn('[SOP Service] sop_completion_items table does not exist in saas_one schema');
    return { success: false, data: null };
  },

  async submitSOPChecklist(propertyId: string, completionId: string, isLate: boolean = false) {
    try {
      const { data, error } = await (supabase as any)
        .from('sop_completions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          is_late: isLate
        })
        .eq('id', completionId)
        .select()
        .single();
        
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('[SOP Service] Submit checklist error:', error);
      throw error;
    }
  },
};
