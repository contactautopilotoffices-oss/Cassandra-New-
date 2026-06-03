
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Video, ResizeMode } from 'expo-av';
import { createClient } from '@/utils/supabase/client';
import { createClientFromToken } from '@/utils/supabase/mobile-auth';
import { serverApi } from '@/lib/serverApi';
import { useTheme, useAuth } from '@/context';
import { useUnreadStore } from '@/stores/unreadStore';
import StatusBadge from '@/components/tickets/StatusBadge';
import SafeBlurView from '@/components/ui/SafeBlurView';


import MediaCaptureModal, { MediaFile } from '@/components/shared/MediaCaptureModal';
import MediaActionsSheet from '@/components/shared/MediaActionsSheet';
import ImagePreviewModal from '@/components/shared/ImagePreviewModal';
import VideoPreviewModal from '@/components/shared/VideoPreviewModal';
import { compressImage, getStoragePath, getStoragePathForSlot, readFileAsArrayBuffer } from '@/utils/mediaUtils';
import { WEB_API_BASE, createTicketMaterialRequest, getProcurementUsers } from '@/utils/api/mobileApi';
import * as FileSystem from 'expo-file-system';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category?: { name: string; code: string } | string;
  skill_group?: { name: string; code: string } | string;
  ticket_number: string;
  created_at: string;
  updated_at: string;
  assigned_at?: string;
  work_started_at?: string;
  resolved_at?: string;
  work_paused: boolean;
  work_pause_reason?: string;
  sla_deadline?: string | null;
  sla_breached?: boolean;
  total_paused_minutes?: number;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
  video_before_url?: string | null;
  video_after_url?: string | null;
  property_id: string;
  organization_id: string;
  /** Raw assigned_to field — the user's UUID (string). Used as fallback when relationship doesn't resolve. */
  assigned_to?: string | null;
  assignee: { id: string; full_name: string; user_photo_url?: string | null; property_memberships?: { role: string; property_id: string }[] } | null;
  creator:  { id: string; full_name: string; email?: string; property_memberships?: { role: string; property_id: string }[] } | null;
  location?: string;
}

interface Comment {
  id: string;
  comment: string;
  created_at: string;
  is_internal: boolean;
  user_id?: string;
  user?: { full_name: string; user_photo_url?: string | null };
}

interface Activity {
  id: string;
  action: string;
  details?: string | null;
  created_at: string;
  performed_by?: string;
  user?: { full_name: string };
}

interface EscalationLog {
  id: string;
  from_level: number;
  to_level: number | null;
  reason: string;
  escalated_at: string;
  from_employee?: { full_name: string } | null;
  to_employee?:  { full_name: string } | null;
}

interface MaterialItem {
  name: string;
  qty: string;
  notes: string;
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'rgba(244,63,94,0.1)',  text: '#F43F5E', label: 'Critical' },
  high:     { bg: 'rgba(249,115,22,0.1)', text: '#F97316', label: 'High' },
  medium:   { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B', label: 'Medium' },
  low:      { bg: 'rgba(148,163,184,0.1)',text: '#94A3B8', label: 'Low' },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open:               ['assigned'],
  assigned:           ['in_progress'],
  in_progress:        ['resolved'],
  resolved:           ['closed', 'in_progress'],
  closed:             ['in_progress'],
};

const STATUS_LABELS: Record<string, string> = {
  open:               'Open',
  assigned:           'Assigned',
  in_progress:        'In Progress',
  resolved:           'Resolved',
  closed:             'Closed',
};

function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60)  return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TicketDetailScreen() {
  const { propertyId, id } = useLocalSearchParams<{ propertyId: string; id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { theme } = useTheme();
  const { user: authUser, session } = useAuth();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();


  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [escalationLogs, setEscalationLogs] = useState<EscalationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'chat'>('details');
  const [mediaUploadType, setMediaUploadType] = useState<'before' | 'after' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [availableMSTs, setAvailableMSTs] = useState<{ id: string; full_name: string }[]>([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([{ name: '', qty: '1', notes: '' }]);
  const [procurementUsers, setProcurementUsers] = useState<{ id: string; full_name: string; user_photo_url?: string; role?: string }[]>([]);
  const [selectedProcurementId, setSelectedProcurementId] = useState<string | null>(null);
  const [showProcurementDropdown, setShowProcurementDropdown] = useState(false);
  const [validationEnabled, setValidationEnabled] = useState(false);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [showLoggersMenu, setShowLoggersMenu] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [updatingPause, setUpdatingPause] = useState(false);

  // Media actions sheet state
  const [selectedMediaSlot, setSelectedMediaSlot] = useState<'before' | 'after' | null>(null);
  const [showMediaActions, setShowMediaActions] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);

  // Property segregation: verify ticket belongs to current property
  const fetchTicket = useCallback(async () => {
    if (!propertyId || !id) return;
    setLoading(true);
    try {
      // Use authUser from context — this is the definitive, always-hydrated user object
      // from AuthContext, which has the session correctly loaded via onAuthStateChange.
      // The supabase client in utils/supabase/client.ts may not share session state with
      // AuthContext's client on Expo Go (separate AsyncStorage hydration), so we bypass it.
      console.log('[fetchTicket] Auth user (from context):', authUser?.id, authUser?.email);

      // Fetch ticket with property_id filter for segregation.
      // IMPORTANT: We fetch assigned_to as a raw column alongside the users!assigned_to
      // relationship. On mobile (Expo Go), the PostgREST foreign-key join can silently
      // return null even when assigned_to is populated — the raw column serves as a
      // reliable fallback for the isAssignee check.
      const { data: ticketData, error: ticketError } = await (supabase
        .from('tickets')
        .select(`*, assigned_to,
                         category:issue_categories(name, code), skill_group:skill_groups(name, code),
                         assignee:users!assigned_to(id, full_name, user_photo_url, property_memberships(role, property_id)),
                         creator:users!raised_by(id, full_name, email, property_memberships(role, property_id))`)
        .eq('id', id)
        .eq('property_id', propertyId)
        .single() as any);

      if (ticketError || !ticketData) {
        console.error('[fetchTicket] Failed to fetch ticket:', ticketError);
        setTicket(null);
        setLoading(false);
        return;
      }

      // 1. Fetch current user's role for this property early for security check
      let userRole = null;
      if (authUser?.id) {
        const { data: memberData } = await (supabase as any)
          .from('property_memberships')
          .select('role')
          .eq('user_id', authUser.id)
          .eq('property_id', propertyId)
          .eq('is_active', true)
          .single();
        userRole = memberData?.role ?? null;
        setCurrentUserRole(userRole);
      }

      // 2. Internal Ticket Security Guard
      const isTenant = userRole === 'tenant' || userRole === 'super_tenant';
      if (ticketData.is_internal && isTenant) {
        console.warn('[fetchTicket] Unauthorized access to internal ticket');
        Alert.alert('Access Denied', 'This is an internal maintenance ticket and is not visible to tenants.');
        router.back();
        setLoading(false);
        return;
      }

      // DEBUG: Log assignee resolution for web-vs-mobile comparison
      console.log('[fetchTicket] Ticket loaded:', {
        ticketId: ticketData.id,
        status: ticketData.status,
        rawAssignedTo: ticketData.assigned_to,
        resolvedAssigneeId: ticketData.assignee?.id,
        resolvedAssigneeName: ticketData.assignee?.full_name,
      });

      // Property segregation guard
      if (ticketData.property_id !== propertyId) {
        console.error('[fetchTicket] Property segregation violation');
        setTicket(null);
        setLoading(false);
        return;
      }

      setTicket(ticketData as Ticket);

      // Fetch comments
      const { data: commentData, error: commentError } = await (supabase
        .from('ticket_comments')
        .select(`*, user:users(full_name, user_photo_url)`)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }) as any);
      if (commentError) console.error('[fetchTicket] Comments error:', commentError);
      setComments((commentData ?? []) as Comment[]);
      if (activeTab !== 'chat' && commentData && commentData.length > 0) {
        useUnreadStore.getState().setTicketChat(commentData.length);
      }

      // Fetch activity
      const { data: activityDataRaw, error: activityError } = await (supabase
        .from('ticket_activity_log')
        .select(`*`)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }) as any);
      if (activityError) console.error('[fetchTicket] Activity error:', activityError);
      
      const activityData = activityDataRaw ?? [];

      // Build userNameMap from activity entries for reassignment display and activity log names
      const newMap: Record<string, string> = {};
      activityData.forEach((act: Activity) => {
        if (act.performed_by && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(act.performed_by)) {
          newMap[act.performed_by] = act.performed_by;
        }
        const detailObj = act.details ? (() => { try { return JSON.parse(act.details); } catch { return null; } })() : null;
        if (
          (act.action === 'assigned' || act.action === 'reassigned') &&
          detailObj?.new_value &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detailObj.new_value)
        ) {
          newMap[detailObj.new_value] = detailObj.new_value;
        }
      });
      // Resolve assignee names from the ticket's assignee relation
      if (ticketData.assignee?.id && ticketData.assignee?.full_name) {
        newMap[ticketData.assignee.id] = ticketData.assignee.full_name;
      }
      if (ticketData.creator?.id && ticketData.creator?.full_name) {
        newMap[ticketData.creator.id] = ticketData.creator.full_name;
      }
      const idsToResolve = Object.keys(newMap).filter(k =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)
      );
      if (idsToResolve.length > 0) {
        const { data: userRows } = await (supabase
          .from('users')
          .select('id, full_name')
          .in('id', idsToResolve) as any);
        (userRows ?? []).forEach((u: { id: string; full_name: string }) => {
          newMap[u.id] = u.full_name;
        });
      }
      
      const populatedActivities = activityData.map((act: Activity) => {
        if (act.performed_by && newMap[act.performed_by] && newMap[act.performed_by] !== act.performed_by) {
           return { ...act, user: { full_name: newMap[act.performed_by] } };
        }
        return act;
      });
      
      setActivities(populatedActivities as Activity[]);
      setUserNameMap(newMap);

      // Fetch escalation logs
      const { data: escData, error: escError } = await supabase
        .from('ticket_escalation_logs')
        .select(`*, from_employee:users!from_employee_id(full_name),
                         to_employee:users!to_employee_id(full_name)`)
        .eq('ticket_id', id)
        .order('escalated_at', { ascending: true });
      if (escError) console.error('[fetchTicket] Escalation error:', escError);
      setEscalationLogs((escData ?? []) as EscalationLog[]);

      // Fetch validationEnabled from property_features
      const { data: featData } = await (supabase as any)
        .from('property_features')
        .select('feature_key, is_enabled')
        .eq('property_id', propertyId)
        .eq('feature_key', 'ticket_validation')
        .maybeSingle();
      setValidationEnabled(featData?.is_enabled === true);


    } catch (err) {
      console.error('[fetchTicket] Unexpected error:', err);
      Alert.alert('Refresh Failed', `Could not reload ticket data. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [propertyId, id, supabase, authUser]);

  const { refetch } = useDashboardFetch(queryKeys.property.ticketDetail(id), fetchTicket, {
    staleTime: 1000 * 60 * 5,
  });

  const fetchMSTs = async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('property_memberships')
      .select('role, user:users(id, full_name)')
      .eq('property_id', propertyId)
      .eq('is_active', true);
    
    const msts = (data ?? [])
      .filter((m: any) => m.role !== 'client')
      .map((m: any) => ({ id: m.user?.id, full_name: m.user?.full_name }))
      .filter((u: any) => u.id && u.full_name);
    setAvailableMSTs(msts as { id: string; full_name: string }[]);
  };

  const fetchProcurementUsers = async () => {
    try {
      const users = await getProcurementUsers({
        propertyId,
        organizationId: ticket?.organization_id,
      });
      console.log('[fetchProcurementUsers] Success! Found users:', users.length);
      setProcurementUsers(users);
    } catch (err) {
      console.error('[fetchProcurementUsers] Failed:', err);
      setProcurementUsers([]);
    }
  };


  const handleAddMaterialItem = () => {
    setMaterialItems(prev => [...prev, { name: '', qty: '1', notes: '' }]);
  };

  const handleRemoveMaterialItem = (index: number) => {
    if (materialItems.length > 1) {
      setMaterialItems(materialItems.filter((_, i) => i !== index));
    } else {
      setMaterialItems([{ name: '', qty: '1', notes: '' }]);
    }
  };

  const updateMaterialItem = (index: number, field: string, value: string) => {
    const newItems = [...materialItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setMaterialItems(newItems);
  };




  const handleSendComment = async () => {
    if (!newComment.trim() || !id) return;
    setSendingComment(true);
    try {
      // Use authUser from AuthContext — the definitive session source.
      const userId = authUser?.id;
      const { data, error } = await supabase
        .from('ticket_comments')
        .insert({ ticket_id: id, comment: newComment.trim(), user_id: userId, is_internal: false } as any)
        .select(`*, user:users(full_name, user_photo_url)`)
        .single();
      if (error) throw error;
      setComments(prev => [...prev, data as Comment]);
      if (activeTab !== 'chat') useUnreadStore.getState().incrementTicketChat();
      setNewComment('');
    } catch (err) {
      console.error('Error sending comment:', err);
    } finally {
      setSendingComment(false);
    }
  };

  const handleAddMaterial = async () => {
    if (!selectedProcurementId || !id) {
       Alert.alert('Selection Required', 'Please select a procurement member to assign this request to.');
       return;
    }
    const validItems = materialItems.filter(item => item.name.trim());
    if (validItems.length === 0) {
       Alert.alert('Items Required', 'Please add at least one material item with a name.');
       return;
    }

    setShowMaterialModal(false);
    try {
      const userId = authUser?.id;
      const procUser = procurementUsers.find(u => u.id === selectedProcurementId);
      
      let commentText = `[MATERIAL REQUESTED]`;
      validItems.forEach((item, index) => {
        commentText += `\n${index + 1}. ${item.qty} of ${item.name.trim()}`;
        if (item.notes.trim()) commentText += ` - Notes: ${item.notes.trim()}`;
      });
      if (procUser) {
        commentText += `\nAssignee: @${procUser.full_name} (${procUser.role ?? 'Procurement'})`;
      }
      
      const requestRes = await createTicketMaterialRequest(id, {
        assignee_uid: selectedProcurementId,
        items: validItems.map((item) => ({
          name: item.name.trim(),
          qty: item.qty,
          notes: item.notes.trim() || undefined,
        })),
      });

      if (!requestRes.success) {
        throw new Error(requestRes.error || 'Failed to create material request');
      }

      // Refresh comments/activity after server-side logging
      await fetchTicket();
      
      // Reset state
      setMaterialItems([{ name: '', qty: '1', notes: '' }]);
      setSelectedProcurementId(null);
      setShowProcurementDropdown(false);
      
      Alert.alert('Success', 'Material request submitted successfully.');
    } catch (err) {
      console.error('Error adding material:', err);
      Alert.alert('Error', 'Failed to submit material request. Please try again.');
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!id || !ticket) return;
    setUpdatingStatus(true);
    setShowStatusPicker(false);

    // Optimistic update: immediately update local state so UI reflects change
    const originalTicket = ticket;
    const optimisticTicket: Ticket = { ...ticket };
    optimisticTicket.status = newStatus;
    if ((newStatus === 'closed' || newStatus === 'resolved') && !ticket.resolved_at) {
      optimisticTicket.resolved_at = new Date().toISOString();
    }
    if (newStatus === 'in_progress' && !ticket.work_started_at) {
      optimisticTicket.work_started_at = new Date().toISOString();
    }
    if (newStatus === 'open' && ticket.status === 'resolved') {
      optimisticTicket.resolved_at = undefined;
    }
    setTicket(optimisticTicket);

    try {
      const updates: any = { status: newStatus };
      // Web app flow: 'closed' = MST completes (sets resolved_at), 'resolved' = tenant approves
      if ((newStatus === 'closed' || newStatus === 'resolved') && !ticket.resolved_at) {
        updates.resolved_at = new Date().toISOString();
      }
      if (newStatus === 'in_progress' && !ticket.work_started_at) {
        updates.work_started_at = new Date().toISOString();
      }
      // When tenant rejects validation → back to 'open', clear resolved_at
      if (newStatus === 'open' && ticket.status === 'resolved') {
        updates.resolved_at = null;
      }

      console.log('[handleUpdateStatus] Updating ticket:', id, 'with:', updates);
      const updateRes = await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: updates,
        filters: [{ op: 'eq', column: 'id', value: id }, { op: 'eq', column: 'property_id', value: propertyId }],
      });

      if (updateRes.error) {
        console.error('[handleUpdateStatus] Server error:', updateRes.error);
        setTicket(originalTicket);
        Alert.alert('Update Failed', `Could not update status: ${updateRes.error.message ?? 'Unknown error'}`);
        return;
      }

      // Verify the update actually persisted in the DB
      const verifyRes = await serverApi.query<{ id: string; status: string; resolved_at: string | null }>({
        table: 'tickets',
        action: 'select',
        select: 'id, status, resolved_at',
        filters: [{ op: 'eq', column: 'id', value: id }, { op: 'eq', column: 'property_id', value: propertyId }],
        single: true,
      });

      if (verifyRes.error || !verifyRes.data) {
        console.error('[handleUpdateStatus] Verification read failed:', verifyRes.error);
        await fetchTicket();
        Alert.alert('Update Failed', 'Could not verify the update. Please refresh the page.');
        return;
      }

      if (verifyRes.data.status !== newStatus) {
        console.error('[handleUpdateStatus] DB status mismatch:', verifyRes.data.status, '!=', newStatus);
        setTicket(originalTicket);
        await fetchTicket();
        Alert.alert('Update Failed', 'Status was not saved. Please try again.');
        return;
      }

      // DB confirmed — proceed with full refresh
      await fetchTicket();

      // Log activity (like web app does)
      // Use authUser from AuthContext — the definitive session source.
      const actingUserId = authUser?.id;
      let activityAction: string | null = null;
      if (newStatus === 'in_progress' && ticket.status === 'assigned') activityAction = 'work_started';
      else if (newStatus === 'resolved' || newStatus === 'closed') activityAction = 'completed';
      else if (newStatus === 'in_progress' && ticket.status === 'resolved') activityAction = 'resumed';

      if (activityAction && actingUserId) {
        try {
          await serverApi.query({
            table: 'ticket_activity_log',
            action: 'insert',
            values: {
              ticket_id: id,
              performed_by: actingUserId,
              action: activityAction,
              details: JSON.stringify({ old_value: ticket.status, new_value: newStatus }),
            },
          });
        } catch (logErr) {
          console.warn('[handleUpdateStatus] Activity log insert failed (non-critical):', logErr);
        }
      }

      const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
      Alert.alert('Status Updated', `Ticket marked as ${statusLabel}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      setTicket(originalTicket);
      Alert.alert('Update Failed', 'Could not refresh ticket data. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleTogglePause = async (reason?: string) => {
    if (!id || !ticket || updatingPause) return;
    setUpdatingPause(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const isPausing = !ticket.work_paused;
      const updates: Record<string, unknown> = {
        work_paused: isPausing,
        work_pause_reason: isPausing ? (reason ?? null) : null,
      };
      await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: updates,
        filters: [{ op: 'eq', column: 'id', value: id }],
      });
      if (user?.id) {
        await serverApi.query({
          table: 'ticket_activity_log',
          action: 'insert',
          values: {
            ticket_id: id,
            user_id: user.id,
            action: isPausing ? 'sla_paused' : 'sla_resumed',
            new_value: isPausing ? (reason ?? 'Paused') : 'Resumed',
          },
        });
      }
      setTicket(prev => prev ? { ...prev, work_paused: isPausing, work_pause_reason: isPausing ? (reason ?? undefined) : undefined } : prev);
    } catch (err) {
      console.warn('[handleTogglePause] error:', err);
    } finally {
      setUpdatingPause(false);
      setShowPauseModal(false);
      setPauseReason(null);
    }
  };

  const handleReassign = async (mstId: string) => {
    if (!id || !ticket) return;
    setShowAssigneePicker(false);

    try {
      // Use authUser from AuthContext — the definitive session source.
      const actingUserId = authUser?.id;

      let newStatus = ticket.status;
      if (mstId) {
        // If assigning TO someone, and current status is open/closed/resolved, move to assigned
        if (['open', 'closed', 'resolved'].includes(ticket.status)) {
          newStatus = 'assigned';
        }
      } else {
        // If unassigning, revert to open
        newStatus = 'open';
      }

      const updates: any = {
        assigned_to: mstId || null,
        status: newStatus,
        assigned_at: mstId ? new Date().toISOString() : null,
      };

      // If we are moving from a finished state to assigned, clear completion data
      if (['closed', 'resolved'].includes(ticket.status) && newStatus === 'assigned') {
        updates.resolved_at = null;
        updates.total_paused_minutes = 0; // Reset metrics if needed
      }

      console.log('[handleReassign] Applying updates:', updates);

      const reassignRes = await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: updates,
        filters: [{ op: 'eq', column: 'id', value: id }, { op: 'eq', column: 'property_id', value: propertyId }],
      });

      if (reassignRes.error) {
        throw new Error(reassignRes.error.message);
      }

      if (actingUserId) {
        // Use raw assigned_to as fallback for old assignee ID
        const oldAssigneeId = ticket.assignee?.id ?? ticket.assigned_to ?? null;
        const oldStatus = ticket.status;
        
        let action = 'assigned';
        if (oldStatus === 'closed' || oldStatus === 'resolved') {
          action = 'reopened';
        } else if (oldAssigneeId && mstId && String(oldAssigneeId) !== String(mstId)) {
          action = 'reassigned';
        }
        
        if (!mstId) action = 'unassigned';

        try {
          await serverApi.query({
            table: 'ticket_activity_log',
            action: 'insert',
            values: {
              ticket_id: id,
              performed_by: actingUserId,
              action: action,
              details: JSON.stringify({ old_value: oldAssigneeId, new_value: mstId }),
            },
          });
        } catch (logErr) {
          console.warn('[handleReassign] Activity log insert failed:', logErr);
        }
      }

      await fetchTicket();
      Alert.alert('Success', mstId ? 'Ticket assigned and reopened successfully.' : 'Ticket unassigned.');
    } catch (err) {
      console.error('[handleReassign] Error:', err);
      Alert.alert('Reassign Failed', 'Could not reassign the ticket. Please try again.');
    }
  };

  const handleMediaDownload = async (url: string, mediaType: 'before' | 'after', fileType: 'photo' | 'video') => {
    if (!url) {
      Alert.alert('Error', 'No media URL available.');
      return;
    }

    try {
      // ── Step 1: Strip Supabase transform params from URL ────────────────────
      const cleanUrl = url.split('?')[0];
      console.log('[handleMediaDownload] URL:', cleanUrl);

      // ── Step 2: Determine file extension ───────────────────────────────────
      const urlParts = cleanUrl.split('.');
      const ext = (urlParts[urlParts.length - 1] || 'jpg').split('?')[0];
      const filename = `${mediaType}_${Date.now()}.${ext}`;

      console.log('[handleMediaDownload] Downloading to cache:', filename);

      // ── Step 3: Download file using new File.downloadFileAsync API ───────────
      const destFile = new File(Paths.cache, filename);
      const downloadedFile = await File.downloadFileAsync(cleanUrl, destFile);
      console.log('[handleMediaDownload] Downloaded:', downloadedFile.uri);

      // ── Step 4: Save Directly to Library ──────────────────────────────────────
      // Requesting with writeOnly: true avoids requiring READ_MEDIA_AUDIO permission on Android 13+
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status === 'granted') {
        try {
          await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
          Alert.alert('Success', `${fileType === 'photo' ? 'Photo' : 'Video'} saved to your library!`);
          return;
        } catch (saveErr) {
          console.warn('[handleMediaDownload] MediaLibrary save failed, falling back to Sharing:', saveErr);
        }
      }

      // ── Step 5: Fallback to Sharing ──────────────────────────────────────────
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadedFile.uri);
      } else {
        Alert.alert('Error', 'Unable to save or share this file.');
      }
    } catch (err: any) {
      console.error('[handleMediaDownload] Error:', err);
      const errorMessage = err?.message || String(err);
      if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('UnableToDownload')) {
        Alert.alert('Network Error', 'Could not reach the server. Please check your connection and try again.');
      } else if (errorMessage.includes('403') || errorMessage.includes('401') || errorMessage.includes('permission')) {
        Alert.alert('Access Denied', 'The file may no longer be publicly accessible.');
      } else {
        Alert.alert('Download Failed', `Could not download the photo. ${errorMessage}`);
      }
    }
  };

  const handleMediaUpload = async (media: MediaFile) => {
    if (!mediaUploadType || !id) return;
    setShowMediaModal(false);
    setIsUploading(true);

    try {
      const isImage = media.type === 'image';
      const newExtension = isImage ? 'jpg' : 'mp4';
      const newBucket = isImage ? 'ticket_photos' : 'ticket_videos';
      const newPath = getStoragePath(propertyId as string, id as string, mediaUploadType, newExtension);

      // ── Step 1: Delete the old file from storage (if any) ──────────────────
      const oldPhotoUrl = mediaUploadType === 'before' ? ticket?.photo_before_url : ticket?.photo_after_url;
      const oldVideoUrl = mediaUploadType === 'before' ? ticket?.video_before_url : ticket?.video_after_url;

      if (oldPhotoUrl) {
        const oldPath = getStoragePathForSlot(propertyId as string, id as string, mediaUploadType, true);
        console.log('[handleMediaUpload] Deleting old photo:', oldPath);
        await supabase.storage.from('ticket_photos').remove([oldPath]);
      }
      if (oldVideoUrl) {
        const oldPath = getStoragePathForSlot(propertyId as string, id as string, mediaUploadType, false);
        console.log('[handleMediaUpload] Deleting old video:', oldPath);
        await supabase.storage.from('ticket_videos').remove([oldPath]);
      }

      // ── Step 2: Compress image if needed ─────────────────────────────────────
      let finalUri = media.uri;
      if (isImage) {
        console.log('[handleMediaUpload] Compressing image...');
        finalUri = await compressImage(media.uri);
      }

      // ── Step 3: Upload new file (overwrites at the same path) ────────────
      // Use an explicit Bearer token client to ensure RLS compliance in Expo Go
      const authClient = session?.access_token 
        ? createClientFromToken(session.access_token)
        : supabase;

      console.log('[handleMediaUpload] Final upload attempt — Bucket:', newBucket, 'Path:', newPath);
      const arrayBuffer = await readFileAsArrayBuffer(finalUri);

      const { error: uploadError } = await authClient.storage
        .from(newBucket)
        .upload(newPath, arrayBuffer, {
          contentType: isImage ? 'image/jpeg' : 'video/mp4',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // ── Step 4: Get public URL and strip Supabase transform params ───────────
      const { data: { publicUrl: rawUrl } } = authClient.storage
        .from(newBucket)
        .getPublicUrl(newPath);

      // Remove Supabase transformation params (e.g. ?transform=...)
      const publicUrl = rawUrl.split('?')[0];
      console.log('[handleMediaUpload] Public URL:', publicUrl);

      // ── Step 5: Build DB update payload ──────────────────────────────────────
      // If type changed (photo→video or video→photo), CLEAR the old column
      const updates: Record<string, unknown> = {};

      if (isImage) {
        updates.photo_before_url = mediaUploadType === 'before' ? publicUrl : undefined;
        updates.photo_after_url  = mediaUploadType === 'after'  ? publicUrl : undefined;
        // Clear the opposite (video) column for this slot
        if (mediaUploadType === 'before') updates.video_before_url = null;
        else                              updates.video_after_url  = null;
      } else {
        updates.video_before_url = mediaUploadType === 'before' ? publicUrl : undefined;
        updates.video_after_url  = mediaUploadType === 'after'  ? publicUrl : undefined;
        // Clear the opposite (photo) column for this slot
        if (mediaUploadType === 'before') updates.photo_before_url = null;
        else                              updates.photo_after_url  = null;
      }

      // Clean up undefined values
      Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

      console.log('[handleMediaUpload] DB updates:', updates);

      const mediaRes = await serverApi.query({
        table: 'tickets',
        action: 'update',
        values: updates,
        filters: [{ op: 'eq', column: 'id', value: id }, { op: 'eq', column: 'property_id', value: propertyId }],
      });

      if (mediaRes.error) throw new Error(mediaRes.error.message);

      await fetchTicket();
      Alert.alert('Success', `${isImage ? 'Photo' : 'Video'} uploaded successfully.`);
    } catch (err) {
      console.error('[handleMediaUpload] Error:', err);
      Alert.alert('Upload Failed', 'There was an error storing your media. Please try again.');
    } finally {
      setIsUploading(false);
      setMediaUploadType(null);
    }
  };

  // Derive current media URL and type from the selected slot
  const getCurrentMedia = () => {
    if (!ticket || !selectedMediaSlot) return { url: '', fileType: 'photo' as const };
    const url = selectedMediaSlot === 'before'
      ? (ticket.photo_before_url || ticket.video_before_url || '')
      : (ticket.photo_after_url || ticket.video_after_url || '');
    const isPhoto = Boolean(
      selectedMediaSlot === 'before'
        ? ticket.photo_before_url
        : ticket.photo_after_url
    );
    return { url, fileType: isPhoto ? ('photo' as const) : ('video' as const) };
  };

  const pCfg = ticket ? (PRIORITY_CONFIG[ticket.priority?.toLowerCase()] ?? PRIORITY_CONFIG.low) : PRIORITY_CONFIG.low;

  // isAssignee: true when the current user is the ticket's assignee.
  // We check BOTH the resolved assignee relationship (ticket.assignee.id) AND the raw
  // assigned_to column. The relationship query can silently fail on mobile (PostgREST
  // FK join blocked by RLS or not resolved in time), while the raw column is always
  // returned directly from the tickets table.
  // isAssignee: true when the current user is the ticket's assignee.
  // We check BOTH the resolved assignee relationship (ticket.assignee.id) AND the raw
  // assigned_to column. The relationship query can silently fail on mobile (PostgREST
  // FK join blocked by RLS or not resolved in time), while the raw column is always
  // returned directly from the tickets table.
  // authUser comes from AuthContext and is the definitive source of truth for the
  // current session on both web and Expo Go.
  const isMSTUser = currentUserRole === 'mst' || currentUserRole === 'property_mst' || currentUserRole === 'property_admin';

  const isAssignee = Boolean(
    authUser?.id &&
    (
      ticket?.assignee?.id === authUser.id ||
      // Normalise both sides to strings for comparison (assigned_to may be stored as
      // a string or as an integer cast from a UUID)
      String(ticket?.assigned_to ?? '') === String(authUser.id) ||
      ticket?.assigned_to === authUser.id
    )
  );

  const canOperateOnTicket = isAssignee || isMSTUser;

  // DEBUG: Log isAssignee resolution every render
  if (__DEV__ && ticket) {
    console.log('[TicketDetail] isAssignee check:', {
      authUserId: authUser?.id,
      assigneeRelId: ticket.assignee?.id,
      rawAssignedTo: ticket.assigned_to,
      isAssignee,
      status: ticket.status,
    });
  }

  const isTenant = currentUserRole === 'client';
  const bg = isDark ? '#0F1521' : '#F8FAFC';
  const cardBg = isDark ? '#1E2633' : '#FFFFFF';
  const textPrimary = isDark ? '#F0F4F8' : '#1A2332';
  const textSecondary = isDark ? '#A0AEC0' : '#64748B';
  const borderColor = isDark ? 'rgba(80,100,130,0.30)' : '#E2E8F0';
  const { colors } = useTheme();
  const primary = colors.primary;
  const textTertiary = colors.textTertiary;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <>
        <Stack.Screen options={{ title: 'Request Not Found' }} />
        <View style={[styles.centered, { backgroundColor: bg }]}>
          <Ionicons name="alert-circle-outline" size={64} color={isDark ? '#4B5563' : '#CBD5E1'} />
          <Text style={[styles.notFoundTitle, { color: textPrimary }]}>Request Not Found</Text>
          <Text style={[styles.notFoundSubtitle, { color: textSecondary }]}>
            This request does not exist or you do not have access.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const slaDeadline = ticket.sla_deadline ? new Date(ticket.sla_deadline) : null;
  const isResolved = ['resolved', 'closed'].includes(ticket.status);
  const referenceTime = isResolved && ticket.resolved_at ? new Date(ticket.resolved_at) : new Date();
  const isSLABreached = Boolean(ticket.sla_breached) ||
    (slaDeadline !== null && slaDeadline < referenceTime);
  const breachMs = slaDeadline && isSLABreached
    ? referenceTime.getTime() - slaDeadline.getTime()
    : 0;

  const availableStatuses = STATUS_TRANSITIONS[ticket.status] ?? [];

  // Find the user who triggered a step by matching the closest activity log entry
  const findStepUser = (
    stepTime: string | null | undefined,
    stepLabel: string
  ): string | undefined => {
    if (!stepTime) return undefined;
    // Created: use ticket creator
    if (stepLabel === 'Created') {
      return ticket.creator?.full_name;
    }
    // Assigned: prefer the assignee (person assigned to), fallback to activity
    if (stepLabel === 'Assigned' && ticket.assignee?.full_name) {
      return ticket.assignee.full_name;
    }
    // For other steps, find the closest activity log entry at or before the step time
    const stepMs = new Date(stepTime).getTime();
    let closest: Activity | null = null;
    let closestDiff = Infinity;
    for (const act of activities) {
      const actMs = new Date(act.created_at).getTime();
      if (actMs <= stepMs) {
        const diff = stepMs - actMs;
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = act;
        }
      }
    }
    return closest?.user?.full_name;
  };

  const slaSteps = [
    { label: 'Created', time: ticket.created_at, done: true, color: '#94A3B8' },
    { label: 'Assigned', time: ticket.assigned_at, done: !!ticket.assigned_at, color: '#3B82F6' },
    { label: 'Started', time: ticket.work_started_at, done: !!ticket.work_started_at, color: '#F59E0B' },
    {
      label: 'Deadline',
      time: ticket.sla_deadline ?? null,
      done: isResolved || !slaDeadline || (slaDeadline > new Date()),
      color: isSLABreached ? '#F43F5E' : '#10B981',
      isDeadline: true,
    },
    { label: 'Resolved', time: ticket.resolved_at, done: !!ticket.resolved_at, color: '#10B981' },
  ].filter(s => s.time || s.label === 'Created').map(s => ({
    ...s,
    userName: findStepUser(s.time, s.label),
  }));

  // Reassignment history: filter activity log for assignment-related events
  const reassignActivities = activities.filter(a =>
    a.action?.includes('assigned') ||
    a.action?.includes('reassign') ||
    a.action?.includes('assigned_to')
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient 
        colors={isDark ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']} 
        style={StyleSheet.absoluteFillObject} 
      />
      
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Top Navigation */}
      <SafeBlurView intensity={80} tint="dark" style={[styles.topNav, {
        backgroundColor: 'transparent',
        borderBottomColor: 'rgba(255,255,255,0.1)',
        paddingTop: Math.max(insets.top, 16)
      }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={26} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topNavTitle, { color: textPrimary }]}>Request Details</Text>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => { Alert.alert('Notifications', 'Notifications coming soon!'); }}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={24} color={textSecondary} />
        </TouchableOpacity>
      </SafeBlurView>

      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sub-section tabs */}
        <View style={[styles.tabContainer, { backgroundColor: 'transparent', borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
          {(['details', 'timeline', 'chat'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => {
                setActiveTab(tab);
                if (tab === 'chat') useUnreadStore.getState().clearTicketChat();
              }}
            >
              <Text style={[
                styles.tabBtnText,
                { color: textSecondary },
                activeTab === tab && { color: '#3B82F6', fontWeight: '800' }
              ]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: activeTab === 'chat' ? (isDark ? 'rgba(11,20,26,0.5)' : 'rgba(239,234,226,0.5)') : 'transparent' }}
          contentContainerStyle={[
            styles.scrollContent,
            activeTab === 'chat' && styles.chatScrollContent
          ]}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'details' && (
            <>
              {/* Title + Badges */}
          <SafeBlurView intensity={60} tint="dark" style={[styles.card, { borderColor }]}>
            <Text style={[styles.ticketNumberLabel, { color: textSecondary }]}>
              {ticket.ticket_number ?? ticket.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={[styles.ticketTitle, { color: textPrimary }]}>{ticket.title}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={ticket.status} />
              <View style={[styles.priorityBadge, { backgroundColor: pCfg.bg }]}>
                <Text style={[styles.priorityText, { color: pCfg.text }]}>{pCfg.label}</Text>
              </View>
              {ticket.work_paused && (
                <View style={[styles.pausedBadge, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <Ionicons name="pause" size={10} color="#F59E0B" />
                  <Text style={[styles.pausedText, { color: '#F59E0B' }]}>Paused</Text>
                </View>
              )}
            </View>
          </SafeBlurView>

          {/* Actions Section — Accessible to all roles for reassignment/management */}
          {(canOperateOnTicket || isTenant) && ticket.status !== 'resolved' && (
            <SafeBlurView intensity={60} tint="dark" style={[styles.card, { borderColor }]}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>Ticket Actions</Text>
              <View style={styles.primaryActionRow}>
                {/* Start Work — Only for the assigned technician */}
                {isAssignee && (ticket.status === 'assigned' || ticket.status === 'open') && (
                  <TouchableOpacity
                    style={[styles.primaryBlockBtn, { backgroundColor: '#3B82F6', flex: 1 }]}
                    onPress={() => handleUpdateStatus('in_progress')}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name="play-circle" size={20} color="#FFF" />
                    )}
                    <Text style={styles.primaryBlockBtnText}>Start Work</Text>
                  </TouchableOpacity>
                )}
                {/* Complete / Send for Validation — Only for the assigned technician */}
                {isAssignee && ticket.status === 'in_progress' && (
                  <TouchableOpacity
                    style={[styles.primaryBlockBtn, { backgroundColor: validationEnabled ? '#8B5CF6' : '#10B981', flex: 1 }]}
                    onPress={() => handleUpdateStatus(validationEnabled ? 'resolved' : 'closed')}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name={validationEnabled ? 'shield-checkmark' : 'checkmark-circle'} size={20} color="#FFF" />
                    )}
                    <Text style={styles.primaryBlockBtnText}>
                      {validationEnabled ? 'Send for Approval' : 'Complete'}
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Pause / Resume SLA — for assignee during in_progress */}
                {isAssignee && ticket.status === 'in_progress' && (
                  <TouchableOpacity
                    style={[styles.primaryBlockBtn, { backgroundColor: ticket.work_paused ? '#10B981' : '#F59E0B', flex: 1 }]}
                    onPress={() => {
                      if (ticket.work_paused) {
                        handleTogglePause();
                      } else {
                        setShowPauseModal(true);
                      }
                    }}
                    disabled={updatingPause}
                  >
                    {updatingPause ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name={ticket.work_paused ? 'play-circle' : 'pause-circle'} size={20} color="#FFF" />
                    )}
                    <Text style={styles.primaryBlockBtnText}>
                      {ticket.work_paused ? 'Resume SLA' : 'Pause SLA'}
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Reassign — always shown except when closed */}
                {ticket.status !== 'closed' && (
                  <TouchableOpacity
                    style={[styles.primaryBlockBtn, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9', flex: 1, shadowOpacity: 0 }]}
                    onPress={() => { fetchMSTs(); setShowAssigneePicker(true); }}
                  >
                    <Ionicons name="swap-horizontal" size={18} color={textPrimary} />
                    <Text style={[styles.primaryBlockBtnText, { color: textPrimary }]}>Reassign</Text>
                  </TouchableOpacity>
                )}
                {/* Reopen — for closed tickets */}
                {ticket.status === 'closed' && (
                  <TouchableOpacity
                    style={[styles.primaryBlockBtn, { backgroundColor: '#F59E0B', flex: 1 }]}
                    onPress={() => { fetchMSTs(); setShowAssigneePicker(true); }}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Ionicons name="refresh-circle" size={20} color="#FFF" />
                    )}
                    <Text style={styles.primaryBlockBtnText}>Reopen</Text>
                  </TouchableOpacity>
                )}
              </View>
            </SafeBlurView>
          )}

          {/* Tenant Validation — shown when ticket is pending client approval */}
          {isTenant && ticket.status === 'resolved' && (
            <View style={[styles.card, { backgroundColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.3)' }]}>
              <View style={styles.validationHeader}>
                <Ionicons name="shield-checkmark" size={22} color="#8B5CF6" />
                <Text style={[styles.sectionTitle, { color: '#8B5CF6' }]}>Awaiting Your Approval</Text>
              </View>
              <Text style={[styles.validationSubtext, { color: textSecondary }]}>
                The service team has completed the work. Please review and approve or request changes.
              </Text>
              <View style={styles.validationActions}>
                <TouchableOpacity
                  style={[styles.validateBtn, { flex: 1 }]}
                  onPress={() => handleUpdateStatus('closed')}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  )}
                  <Text style={styles.validateBtnText}>Looks Good</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, { flex: 1 }]}
                  onPress={() => handleUpdateStatus('open')}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  )}
                  <Text style={styles.rejectBtnText}>Request Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* SLA Breach Banner */}
          {slaDeadline && (
            <View style={[
              styles.slaCard,
              {
                backgroundColor: isSLABreached
                  ? (isDark ? 'rgba(244,63,94,0.12)' : 'rgba(244,63,94,0.08)')
                  : (isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)'),
                borderColor: isSLABreached ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)',
              },
            ]}>
              <View style={styles.slaHeader}>
                <Ionicons
                  name={isSLABreached ? 'alert-circle' : 'checkmark-circle'}
                  size={20}
                  color={isSLABreached ? '#F43F5E' : '#10B981'}
                />
                <Text style={[
                  styles.slaTitle,
                  { color: isSLABreached ? '#F43F5E' : '#10B981' },
                ]}>
                  {isSLABreached ? 'SLA Breached' : 'SLA On Track'}
                </Text>
                {isSLABreached && breachMs > 0 && (
                  <Text style={styles.slaBreachTime}>+{formatDuration(breachMs)}</Text>
                )}
              </View>
              <Text style={[styles.slaSubtext, { color: textSecondary }]}>
                {isSLABreached
                  ? isResolved ? 'Resolved after SLA deadline' : 'Service Level Agreement not met'
                  : 'Within agreed service time'}
              </Text>
            </View>
          )}

          {/* Description */}
          <SafeBlurView intensity={60} tint="dark" style={[styles.card, { borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Description</Text>
            <Text style={[styles.description, { color: textSecondary }]}>{ticket.description}</Text>
            <View style={[styles.divider, { backgroundColor: borderColor }]} />
            <View style={styles.metaRow}>
              {ticket.creator?.full_name && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={14} color={textSecondary} />
                  <Text style={[styles.metaText, { color: textSecondary }]}>
                    {ticket.creator.full_name}
                  </Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={textSecondary} />
                <Text style={[styles.metaText, { color: textSecondary }]}>
                  {formatDate(ticket.created_at)}
                </Text>
              </View>
              {ticket.location && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color={textSecondary} />
                  <Text style={[styles.metaText, { color: textSecondary }]}>{ticket.location}</Text>
                </View>
              )}
            </View>
          </SafeBlurView>

          {/* Ticket Information */}
          <SafeBlurView intensity={60} tint="dark" style={[styles.card, { borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Ticket Information</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: textSecondary, fontSize: 14 }}>Department</Text>
              <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '500' }}>
                {ticket.skill_group
                  ? (typeof ticket.skill_group === 'string'
                      ? ticket.skill_group.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                      : ticket.skill_group.name)
                  : 'N/A'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: textSecondary, fontSize: 14 }}>Raised By</Text>
              <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '500', textAlign: 'right' }}>
                {ticket.creator?.full_name || 'System / Unknown'}{'\n'}
                <Text style={{ color: textSecondary, fontSize: 12, fontWeight: '400' }}>
                  {ticket.creator?.property_memberships?.find(m => m.property_id === propertyId)?.role?.replace('_', ' ')?.replace(/\b\w/g, l => l.toUpperCase()) || 'User'}
                </Text>
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: textSecondary, fontSize: 14 }}>Served By</Text>
              <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '500', textAlign: 'right' }}>
                {ticket.assignee?.full_name || 'Unassigned'}{'\n'}
                {ticket.assignee && (
                  <Text style={{ color: textSecondary, fontSize: 12, fontWeight: '400' }}>
                    {ticket.assignee.property_memberships?.find(m => m.property_id === propertyId)?.role?.replace('_', ' ')?.replace(/\b\w/g, l => l.toUpperCase()) || 'Technician'}
                  </Text>
                )}
              </Text>
            </View>
          </SafeBlurView>
            </>
          )}

          {activeTab === 'timeline' && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.seqHeader}>
                <Ionicons name="git-commit" size={16} color={textPrimary} />
                <Text style={[styles.sectionTitle, { color: textPrimary, marginBottom: 0 }]}>
                  Sequence of Events
                </Text>
                <Text style={[styles.seqCount, { color: textSecondary }]}>
                  {1 + activities.length + escalationLogs.length} events
                </Text>
              </View>

              <View style={styles.seqTimeline}>
                {/* 1. Ticket Created */}
                <View style={styles.seqEvent}>
                  <View style={styles.seqLeft}>
                    <View style={[styles.seqDot, { backgroundColor: '#94A3B8' }]}>
                      <Ionicons name="add-circle" size={14} color="#FFF" />
                    </View>
                    <View style={[styles.seqLine, { backgroundColor: borderColor }]} />
                  </View>
                  <View style={styles.seqRight}>
                    <View style={[styles.seqCard, { borderColor: 'rgba(148,163,184,0.2)', backgroundColor: isDark ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.05)' }]}>
                      <View style={styles.seqCardHeader}>
                        <Text style={[styles.seqAction, { color: '#94A3B8' }]}>Ticket Created</Text>
                        <Text style={[styles.seqTime, { color: textSecondary }]}>
                          {ticket.created_at ? formatDate(ticket.created_at) : '—'}
                        </Text>
                      </View>
                      <View style={styles.seqUserRow}>
                        <View style={[styles.seqAvatar, { backgroundColor: 'rgba(148,163,184,0.12)' }]}>
                          <Text style={[styles.seqAvatarText, { color: '#94A3B8' }]}>
                            {ticket.creator?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <Text style={[styles.seqUserName, { color: textPrimary }]}>
                          {ticket.creator?.full_name ?? 'Unknown'}
                        </Text>
                      </View>
                      {ticket.description && (
                        <Text style={[styles.seqNote, { color: textSecondary }]} numberOfLines={2}>
                          {ticket.description}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* 2. Activity Log Events */}
                {activities.map((act, idx) => {
                  const detailObj = act.details ? (() => { try { return JSON.parse(act.details); } catch { return null; } })() : null;
                  const isReassign = act.action?.includes('reassign') || act.action === 'assigned' || act.action === 'reopened';
                  const isStart = act.action === 'work_started' || act.action === 'in_progress';
                  const isComplete = act.action === 'completed' || act.action === 'resolved' || act.action === 'closed';
                  const isPriority = act.action === 'priority_changed' || act.action === 'priority';

                  // Determine icon, color, and label for this action
                  let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
                  let dotColor = '#6366F1';
                  let actionLabel = act.action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? 'Event';

                  if (isReassign) {
                    dotColor = '#3B82F6';
                    if (act.action === 'reopened') {
                      iconName = 'refresh-circle';
                      actionLabel = 'Ticket Reopened';
                    } else {
                      iconName = 'swap-horizontal';
                      actionLabel = act.action === 'assigned' ? 'Ticket Assigned' : 'Ticket Reassigned';
                    }
                  } else if (isStart) {
                    iconName = 'play-circle';
                    dotColor = '#F59E0B';
                    actionLabel = 'Work Started';
                  } else if (isComplete) {
                    iconName = 'checkmark-circle';
                    dotColor = '#10B981';
                    actionLabel = act.action === 'closed' ? 'Ticket Closed' : 'Ticket Completed';
                  } else if (isPriority) {
                    iconName = 'flag';
                    dotColor = '#F97316';
                    actionLabel = 'Priority Changed';
                  } else if (act.action === 'sla_breached') {
                    iconName = 'warning';
                    dotColor = '#F43F5E';
                    actionLabel = 'SLA Breached';
                  }

                  // For reassignments, resolve user names
                  const performerName = act.user?.full_name ?? 'Unknown';
                  let fromName: string | null = null;
                  let toName: string | null = null;

                  if (isReassign && detailObj?.new_value) {
                    // new_value is the assignee UUID
                    toName = userNameMap[detailObj.new_value] ?? detailObj.new_value;
                    // old_value might be a previous assignee UUID
                    if (detailObj.old_value && userNameMap[detailObj.old_value]) {
                      fromName = userNameMap[detailObj.old_value];
                    } else if (detailObj.old_value) {
                      fromName = userNameMap[detailObj.old_value] ?? null;
                    }
                  }

                  const isLast = idx === activities.length - 1 && escalationLogs.length === 0;

                  return (
                    <View key={act.id} style={styles.seqEvent}>
                      <View style={styles.seqLeft}>
                        <View style={[styles.seqDot, { backgroundColor: dotColor }]}>
                          <Ionicons name={iconName} size={12} color="#FFF" />
                        </View>
                        {!isLast && (
                          <View style={[styles.seqLine, { backgroundColor: borderColor }]} />
                        )}
                      </View>
                      <View style={styles.seqRight}>
                        <View style={[styles.seqCard, {
                          borderColor: isReassign ? 'rgba(59,130,246,0.2)'
                            : isComplete ? 'rgba(16,185,129,0.2)'
                            : 'rgba(99,102,241,0.15)',
                          backgroundColor: isDark ? 'rgba(30,38,51,0.6)' : '#FAFBFF',
                        }]}>
                          <View style={styles.seqCardHeader}>
                            <Text style={[styles.seqAction, { color: dotColor }]}>{actionLabel}</Text>
                            <Text style={[styles.seqTime, { color: textSecondary }]}>
                              {formatDate(act.created_at)}
                            </Text>
                          </View>

                          {/* Performer */}
                          <View style={styles.seqUserRow}>
                            <View style={[styles.seqAvatar, { backgroundColor: `${dotColor}20` }]}>
                              <Text style={[styles.seqAvatarText, { color: dotColor }]}>
                                {performerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={[styles.seqUserName, { color: textPrimary }]}>
                              {performerName}
                            </Text>
                          </View>

                          {/* Reassignment detail: from → to */}
                          {isReassign && (
                            <View style={[styles.seqReassignRow, { borderColor: 'rgba(59,130,246,0.15)' }]}>
                              <View style={styles.seqReassignPerson}>
                                <Ionicons name="person-outline" size={12} color={textSecondary} />
                                <Text style={[styles.seqReassignLabel, { color: textSecondary }]}>From</Text>
                                <Text style={[styles.seqReassignName, { color: textSecondary }]} numberOfLines={1}>
                                  {fromName ?? 'Unassigned'}
                                </Text>
                              </View>
                              <Ionicons name="arrow-forward" size={12} color="#3B82F6" />
                              <View style={styles.seqReassignPerson}>
                                <Ionicons name="person" size={12} color="#3B82F6" />
                                <Text style={[styles.seqReassignLabel, { color: textSecondary }]}>To</Text>
                                <Text style={[styles.seqReassignName, { color: '#3B82F6' }]} numberOfLines={1}>
                                  {toName ?? 'No Assignee'}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Priority change detail */}
                          {isPriority && detailObj?.new_value && (
                            <View style={styles.seqChangeRow}>
                              <Text style={[styles.seqChangeLabel, { color: textSecondary }]}>
                                {detailObj.old_value ? `${detailObj.old_value?.toUpperCase()} → ` : ''}
                              </Text>
                              <View style={[styles.seqPriorityBadge, { backgroundColor: `${dotColor}15` }]}>
                                <Text style={[styles.seqPriorityText, { color: dotColor }]}>
                                  {detailObj.new_value?.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                          )}

                          {/* Status change detail (non-reassign) */}
                          {!isReassign && !isPriority && detailObj?.new_value && (
                            <View style={styles.seqChangeRow}>
                              {detailObj.old_value && (
                                <>
                                  <Text style={[styles.seqChangeLabel, { color: textSecondary }]}>
                                    {detailObj.old_value?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                  </Text>
                                  <Ionicons name="arrow-forward" size={10} color={textSecondary} style={{ marginHorizontal: 4 }} />
                                </>
                              )}
                              <Text style={[styles.seqChangeLabel, { color: dotColor, fontWeight: '600' }]}>
                                {detailObj.new_value?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* 3. Escalation Events */}
                {escalationLogs.map((log, idx) => {
                  const reasonLabel = log.reason === 'timeout' ? 'SLA Timeout'
                    : log.reason === 'manual' ? 'Manual Escalation' : log.reason || 'Escalation';
                  const isLast = idx === escalationLogs.length - 1;
                  return (
                    <View key={log.id} style={styles.seqEvent}>
                      <View style={styles.seqLeft}>
                        <View style={[styles.seqDot, { backgroundColor: '#F43F5E' }]}>
                          <Ionicons name="arrow-up-circle" size={12} color="#FFF" />
                        </View>
                        {!isLast && (
                          <View style={[styles.seqLine, { backgroundColor: borderColor }]} />
                        )}
                      </View>
                      <View style={styles.seqRight}>
                        <View style={[styles.seqCard, {
                          borderColor: 'rgba(244,63,94,0.2)',
                          backgroundColor: 'rgba(244,63,94,0.04)',
                        }]}>
                          <View style={styles.seqCardHeader}>
                            <Text style={[styles.seqAction, { color: '#F43F5E' }]}>Escalated</Text>
                            <View style={[styles.seqReasonBadge, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                              <Text style={[styles.seqReasonText, { color: '#F59E0B' }]}>{reasonLabel}</Text>
                            </View>
                            <Text style={[styles.seqTime, { color: textSecondary }]}>
                              {formatDate(log.escalated_at)}
                            </Text>
                          </View>

                          {/* Level change */}
                          <View style={styles.seqLevelRow}>
                            <View style={[styles.seqLevelBadge, { backgroundColor: 'rgba(148,163,184,0.12)' }]}>
                              <Text style={[styles.seqLevelText, { color: '#94A3B8' }]}>L{log.from_level}</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={12} color="#F43F5E" />
                            <View style={[styles.seqLevelBadge, styles.seqLevelBadgeActive]}>
                              <Text style={[styles.seqLevelTextActive, { color: '#F43F5E' }]}>
                                L{log.to_level ?? 'Final'}
                              </Text>
                            </View>
                          </View>

                          {/* Employee change */}
                          <View style={styles.seqEscEmployeeRow}>
                            <View style={styles.seqEscEmployee}>
                              <View style={[styles.seqAvatar, { backgroundColor: isDark ? '#2D3748' : '#E2E8F0' }]}>
                                <Text style={[styles.seqAvatarText, { color: '#64748B' }]}>
                                  {log.from_employee?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                                </Text>
                              </View>
                              <Text style={[styles.seqUserName, { color: textSecondary }]} numberOfLines={1}>
                                {log.from_employee?.full_name ?? 'Unassigned'}
                              </Text>
                            </View>
                            <Ionicons name="arrow-forward" size={12} color="#F43F5E" />
                            <View style={styles.seqEscEmployee}>
                              <View style={[styles.seqAvatar, { backgroundColor: 'rgba(244,63,94,0.12)' }]}>
                                <Text style={[styles.seqAvatarText, { color: '#F43F5E' }]}>
                                  {log.to_employee?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                                </Text>
                              </View>
                              <Text style={[styles.seqUserName, { color: textPrimary }]} numberOfLines={1}>
                                {log.to_employee?.full_name ?? 'No Assignee'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {activeTab === 'details' && (
            <>
              {/* Media Section */}
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Photos & Videos</Text>
            {isUploading && (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={[styles.uploadingText, { color: textSecondary }]}>Uploading...</Text>
              </View>
            )}
            <View style={styles.mediaGrid}>
              {/* Before */}
              <TouchableOpacity
                style={[styles.mediaSlot, { backgroundColor: isDark ? '#1E2633' : '#F8FAFC', borderColor }]}
                onPress={() => {
                  const hasMedia = Boolean(ticket.photo_before_url || ticket.video_before_url);
                  if (hasMedia) {
                    setSelectedMediaSlot('before');
                    setShowMediaActions(true);
                  } else {
                    setMediaUploadType('before');
                    setShowMediaModal(true);
                  }
                }}
                disabled={isUploading}
              >
                {ticket.photo_before_url ? (
                  <Image source={{ uri: ticket.photo_before_url }} style={styles.mediaImage} />
                ) : ticket.video_before_url ? (
                  <Video
                    source={{ uri: ticket.video_before_url }}
                    style={styles.mediaImage}
                    resizeMode={ResizeMode.COVER}
                    isMuted
                    shouldPlay
                    isLooping
                  />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="camera-outline" size={28} color={isDark ? '#4B5563' : '#CBD5E1'} />
                    <Text style={[styles.mediaSlotLabel, { color: textSecondary }]}>Before</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* After */}
              <TouchableOpacity
                style={[styles.mediaSlot, { backgroundColor: isDark ? '#1E2633' : '#F8FAFC', borderColor }]}
                onPress={() => {
                  const hasMedia = Boolean(ticket.photo_after_url || ticket.video_after_url);
                  if (hasMedia) {
                    setSelectedMediaSlot('after');
                    setShowMediaActions(true);
                  } else {
                    setMediaUploadType('after');
                    setShowMediaModal(true);
                  }
                }}
                disabled={isUploading}
              >
                {ticket.photo_after_url ? (
                  <Image source={{ uri: ticket.photo_after_url }} style={styles.mediaImage} />
                ) : ticket.video_after_url ? (
                  <Video
                    source={{ uri: ticket.video_after_url }}
                    style={styles.mediaImage}
                    resizeMode={ResizeMode.COVER}
                    isMuted
                    shouldPlay
                    isLooping
                  />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="camera-outline" size={28} color={isDark ? '#4B5563' : '#CBD5E1'} />
                    <Text style={[styles.mediaSlotLabel, { color: textSecondary }]}>After</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Assignee */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
              Assigned Technician
            </Text>
            {ticket.assignee ? (
              <View style={styles.assigneeRow}>
                <View style={[styles.assigneeAvatar, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                  {ticket.assignee.user_photo_url ? (
                    <Image source={{ uri: ticket.assignee.user_photo_url }} style={styles.assigneeAvatarImg} />
                  ) : (
                    <Text style={styles.assigneeInitials}>
                      {ticket.assignee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assigneeName, { color: textPrimary }]}>
                    {ticket.assignee.full_name}
                  </Text>
                  {ticket.assigned_at && (
                    <Text style={[styles.assigneeMeta, { color: textSecondary }]}>
                      Assigned {timeAgo(ticket.assigned_at)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.reassignBtn}
                  onPress={() => { fetchMSTs(); setShowAssigneePicker(true); }}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#3B82F6" />
                  <Text style={styles.reassignBtnText}>Reassign</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.noAssignee}>
                <Ionicons name="person-outline" size={28} color={isDark ? '#4B5563' : '#CBD5E1'} />
                <Text style={[styles.noAssigneeText, { color: textSecondary }]}>
                  No technician assigned yet
                </Text>
                <TouchableOpacity
                  style={styles.assignNowBtn}
                  onPress={() => { fetchMSTs(); setShowAssigneePicker(true); }}
                >
                  <Text style={styles.assignNowBtnText}>Assign Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
            </>
          )}

          {activeTab === 'chat' && (
            <View style={[styles.whatsappBackground, { backgroundColor: isDark ? '#0B141A' : '#EFEAE2' }]}>
              {/* Chat Feed */}
              {(comments.length > 0) && (
              <View style={styles.whatsappChatContainer}>
                {[
                  ...comments.map(c => ({ ...c, type: 'comment' as const }))
                ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                 .map(event => {
                    const isMe = Boolean(authUser?.id && event.user_id === authUser.id);
                    return (
                      <View key={`com_${event.id}`} style={[styles.chatRow, isMe ? styles.chatRowRight : styles.chatRowLeft]}>
                        {!isMe && (
                          <View style={[styles.chatAvatar, { backgroundColor: isDark ? '#2D3748' : '#E2E8F0' }]}>
                            {event.user?.user_photo_url ? (
                              <Image source={{ uri: event.user.user_photo_url }} style={styles.chatAvatarImg} />
                            ) : (
                              <Text style={[styles.chatAvatarText, { color: isDark ? '#A0AEC0' : '#64748B' }]}>
                                {event.user?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                              </Text>
                            )}
                          </View>
                        )}
                        <View style={[
                          styles.chatBubble,
                          isMe ? [styles.chatBubbleMe, { backgroundColor: isDark ? '#005C4B' : '#D9FDD3' }]
                               : [styles.chatBubbleOther, { backgroundColor: isDark ? '#202C33' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E2E8F0', borderWidth: isDark ? 0 : 1 }]
                        ]}>
                          {!isMe && (
                            <Text style={[styles.chatAuthorName, { color: isDark ? '#A0AEC0' : '#3B82F6' }]}>
                              {event.user?.full_name ?? 'Unknown'}
                            </Text>
                          )}
                          <Text style={[styles.chatMessageText, { color: isMe ? (isDark ? '#FFF' : '#111') : textPrimary }]}>
                            {event.comment}
                          </Text>
                          <Text style={[styles.chatMessageTime, { color: isMe ? (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)') : textSecondary }]}>
                            {formatDate(event.created_at)}
                          </Text>
                        </View>
                      </View>
                    );
                })}
              </View>
          )}
            </View>
          )}

          {/* Bottom padding for comment input */}
          <View style={{ height: activeTab === 'chat' ? 0 : 100 }} />
        </ScrollView>

        {/* Comment Input (sticky bottom) */}
        {activeTab === 'chat' && (
          <View style={[
            styles.whatsappInputBar,
            { backgroundColor: isDark ? '#1F2C34' : '#F0F2F5', marginBottom: Math.max(insets.bottom, 8) + 70 },
          ]}>
            <TouchableOpacity 
              style={{ marginRight: 8, padding: 8 }} 
              onPress={() => { setShowMaterialModal(true); fetchProcurementUsers(); }}
            >
              <Ionicons name="add" size={24} color={isDark ? '#8696A0' : '#54656F'} />
            </TouchableOpacity>
            <TextInput
              style={[
                styles.whatsappInput,
                {
                  backgroundColor: isDark ? '#2A3942' : '#FFFFFF',
                  color: textPrimary,
                },
              ]}
              placeholder="Type a message..."
              placeholderTextColor={isDark ? '#8696A0' : '#8696A0'}
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <View style={styles.whatsappSendWrapper}>
              <TouchableOpacity
                style={[
                  styles.whatsappSendBtn,
                  !newComment.trim() && styles.sendBtnDisabled,
                ]}
                onPress={handleSendComment}
                disabled={!newComment.trim() || sendingComment}
              >
                {sendingComment ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="send" size={18} color="#FFF" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>



      {/* Status Picker Modal */}
      <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStatusPicker(false)}
        >
          <View style={[styles.pickerCard, { backgroundColor: isDark ? '#1E2633' : '#FFF', borderColor }]}>
            <Text style={[styles.pickerTitle, { color: textPrimary }]}>Change Status</Text>
            {availableStatuses.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.pickerItem, { borderColor }]}
                onPress={() => handleUpdateStatus(s)}
              >
                <Text style={[styles.pickerItemText, { color: textPrimary }]}>
                  {STATUS_LABELS[s] ?? s}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.pickerItem, { borderColor }]}
              onPress={() => setShowStatusPicker(false)}
            >
              <Text style={[styles.pickerItemText, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Material Modal */}
      <Modal visible={showMaterialModal} transparent animationType="fade" onRequestClose={() => setShowMaterialModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={[styles.pickerCard, { backgroundColor: isDark ? '#1E2633' : '#FFF', borderColor, width: '96%', padding: 20, borderRadius: 28, maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="cube-outline" size={24} color="#69D2A4" />
                <Text style={{ color: textPrimary, fontSize: 20, fontWeight: '800', fontStyle: 'italic' }}>Request Materials</Text>
              </View>
              <TouchableOpacity onPress={() => setShowMaterialModal(false)}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: textSecondary, fontSize: 13, fontStyle: 'italic', marginBottom: 24 }}>Requisition materials from the inventory forces.</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Assign To Procurement</Text>
              <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '700' }}>REQUIRED</Text>
            </View>

            <View style={{ marginBottom: 24, zIndex: 10 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 12,
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
                }}
                onPress={() => setShowProcurementDropdown(!showProcurementDropdown)}
              >
                {selectedProcurementId ? (
                  (() => {
                    const u = procurementUsers.find(user => user.id === selectedProcurementId);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' }}>
                          {u?.user_photo_url ? (
                            <Image source={{ uri: u.user_photo_url }} style={{ width: 40, height: 40 }} />
                          ) : (
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>{u?.full_name?.charAt(0)}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#1A2332', fontSize: 14, fontWeight: '700' }}>{u?.full_name}</Text>
                          <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '500' }}>{u?.role ?? 'Procurement'}</Text>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '600' }}>-- Select Member --</Text>
                )}
                <Ionicons name={showProcurementDropdown ? "chevron-up" : "chevron-expand"} size={18} color="#64748B" />
              </TouchableOpacity>

              {showProcurementDropdown && (
                <View style={{
                  position: 'absolute', top: 68, left: 0, right: 0, zIndex: 100,
                  borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16,
                  backgroundColor: '#FFFFFF', maxHeight: 200, overflow: 'hidden',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5
                }}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {procurementUsers.map((u, i) => (
                      <TouchableOpacity
                        key={u.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center', padding: 12,
                          borderBottomWidth: i === procurementUsers.length - 1 ? 0 : 1,
                          borderBottomColor: '#F1F5F9',
                          backgroundColor: selectedProcurementId === u.id ? '#F0FDF4' : 'transparent'
                        }}
                        onPress={() => { setSelectedProcurementId(u.id); setShowProcurementDropdown(false); }}
                      >
                         <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 10, overflow: 'hidden' }}>
                          {u.user_photo_url ? (
                            <Image source={{ uri: u.user_photo_url }} style={{ width: 32, height: 32 }} />
                          ) : (
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>{u.full_name?.charAt(0)}</Text>
                          )}
                        </View>
                        <View>
                          <Text style={{ color: selectedProcurementId === u.id ? '#10B981' : '#1A2332', fontSize: 13, fontWeight: '600' }}>{u.full_name}</Text>
                          <Text style={{ color: '#64748B', fontSize: 10 }}>{u.role ?? 'Procurement'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 15, color: '#1A2332', fontWeight: '700' }}>Material Items</Text>
              <TouchableOpacity onPress={handleAddMaterialItem} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '700' }}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 450, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
              {materialItems.map((item, index) => (
                <View key={index} style={{ 
                  borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, 
                  padding: 16, backgroundColor: '#F8FAFC', marginBottom: 12 
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="options-outline" size={20} color="#3B82F6" />
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveMaterialItem(index)}>
                      <Ionicons name="trash-outline" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Item Name / Code</Text>
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, 
                        color: '#1A2332', backgroundColor: '#FFFFFF', fontSize: 14
                      }}
                      placeholder="e.g. HVAC Filter Grade-A"
                      placeholderTextColor="#CBD5E1"
                      value={item.name}
                      onChangeText={(val) => updateMaterialItem(index, 'name', val)}
                    />
                  </View>

                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Qty</Text>
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, 
                        color: '#1A2332', backgroundColor: '#FFFFFF', fontSize: 14
                      }}
                      keyboardType="numeric"
                      value={item.qty}
                      onChangeText={(val) => updateMaterialItem(index, 'qty', val)}
                    />
                  </View>

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase' }}>Notes</Text>
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, 
                        color: '#1A2332', backgroundColor: '#FFFFFF', fontSize: 13, height: 60, textAlignVertical: 'top'
                      }}
                      multiline
                      placeholder="Specific brand requirements or delivery instructions..."
                      placeholderTextColor="#CBD5E1"
                      value={item.notes}
                      onChangeText={(val) => updateMaterialItem(index, 'notes', val)}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 16, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16 }}
                onPress={() => { setShowMaterialModal(false); setMaterialItems([{ name: '', qty: '1', notes: '' }]); setSelectedProcurementId(null); setShowProcurementDropdown(false); }}
              >
                <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 }}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1.5, paddingVertical: 16, alignItems: 'center', backgroundColor: '#69D2A4', borderRadius: 16, shadowColor: '#69D2A4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                onPress={handleAddMaterial}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="cube-outline" size={18} color="#FFF" />
                  <View>
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>SUBMIT</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 9, letterSpacing: 0.5 }}>REQUEST</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assignee Picker Modal */}
      <Modal visible={showAssigneePicker} transparent animationType="fade" onRequestClose={() => setShowAssigneePicker(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAssigneePicker(false)}
        >
          <View style={[styles.pickerCard, { backgroundColor: isDark ? '#1E2633' : '#FFF', borderColor }]}>
            <Text style={[styles.pickerTitle, { color: textPrimary }]}>Reassign To</Text>
            <ScrollView 
              style={{ maxHeight: 400 }} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {availableMSTs.length === 0 ? (
                <Text style={[styles.noMSTText, { color: textSecondary }]}>
                  No technicians available
                </Text>
              ) : (
                availableMSTs.map(mst => (
                  <TouchableOpacity
                    key={mst.id}
                    style={[styles.pickerItem, { borderColor }]}
                    onPress={() => handleReassign(mst.id)}
                  >
                    <Text style={[styles.pickerItemText, { color: textPrimary }]}>
                      {mst.full_name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.pickerItem, { borderColor, borderTopWidth: 1, marginTop: 8 }]}
              onPress={() => setShowAssigneePicker(false)}
            >
              <Text style={[styles.pickerItemText, { color: textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <MediaCaptureModal
        key={`media-capture-${mediaUploadType}-${Date.now()}`}
        isOpen={showMediaModal}
        onClose={() => { setShowMediaModal(false); setMediaUploadType(null); }}
        onCapture={handleMediaUpload}
        title={`Upload ${mediaUploadType === 'before' ? 'Before' : 'After'} Media`}
      />

      {/* Loggers Modal */}
      {/* SLA Pause Reason Modal */}
      <Modal visible={showPauseModal} transparent animationType="slide" onRequestClose={() => { setShowPauseModal(false); setPauseReason(null); }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => { setShowPauseModal(false); setPauseReason(null); }}
        >
          <View style={{
            backgroundColor: cardBg,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            padding: 24,
            paddingBottom: Math.max(insets.bottom, 40),
            width: '100%',
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary, marginBottom: 6 }}>Pause SLA</Text>
            <Text style={{ fontSize: 13, color: textSecondary, marginBottom: 20 }}>Select a reason for pausing the SLA clock:</Text>
            {(['Waiting for Parts', 'Pending Approval'] as const).map(reason => (
              <TouchableOpacity
                key={reason}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 10,
                  borderWidth: 1.5,
                  borderColor: pauseReason === reason ? '#F59E0B' : borderColor,
                  backgroundColor: pauseReason === reason ? 'rgba(245,158,11,0.1)' : 'transparent',
                }}
                onPress={() => setPauseReason(reason)}
              >
                <Ionicons name={pauseReason === reason ? 'radio-button-on' : 'radio-button-off'} size={20} color={pauseReason === reason ? '#F59E0B' : textSecondary} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: pauseReason === reason ? '#F59E0B' : textPrimary }}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{
                marginTop: 8, borderRadius: 14, paddingVertical: 15,
                backgroundColor: pauseReason ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
              }}
              onPress={() => pauseReason && handleTogglePause(pauseReason)}
              disabled={!pauseReason || updatingPause}
            >
              {updatingPause
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="pause-circle" size={20} color={pauseReason ? '#FFF' : textSecondary} />
              }
              <Text style={{ fontSize: 15, fontWeight: '700', color: pauseReason ? '#FFF' : textSecondary }}>Confirm Pause</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showLoggersMenu} transparent animationType="slide" onRequestClose={() => setShowLoggersMenu(false)}>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowLoggersMenu(false)}
        >
          <View style={{ 
            backgroundColor: cardBg, 
            borderTopLeftRadius: 32, 
            borderTopRightRadius: 32, 
            padding: 24, 
            paddingBottom: Math.max(insets.bottom, 40),
            width: '100%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 20
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary, marginBottom: 20 }}>Utility Loggers</Text>
            
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 18, gap: 14, borderBottomWidth: 1, borderBottomColor: borderColor }} 
              onPress={() => { setShowLoggersMenu(false); router.push(`/property/${propertyId}/electricity` as any); }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="flash" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>Electricity Logger</Text>
                <Text style={{ fontSize: 12, color: textSecondary }}>Log power consumption & meter readings</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 18, gap: 14 }} 
              onPress={() => { setShowLoggersMenu(false); router.push(`/property/${propertyId}/diesel` as any); }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="water" size={20} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>Diesel Logger</Text>
                <Text style={{ fontSize: 12, color: textSecondary }}>Log fuel refills & generator levels</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={textTertiary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Media Actions Sheet — shown when tapping an existing photo/video */}
      {(() => {
        const { url, fileType } = getCurrentMedia();
        return (
          <MediaActionsSheet
            isOpen={showMediaActions}
            mediaType={selectedMediaSlot || 'before'}
            fileType={fileType}
            onViewFullScreen={() => {
              if (fileType === 'photo' && url) {
                setPreviewMediaUrl(url);
                setShowImagePreview(true);
              } else if (fileType === 'video' && url) {
                setPreviewMediaUrl(url);
                setShowVideoPreview(true);
              }
            }}
            onReplace={() => {
              // Close the sheet, then open camera after a short delay
              setShowMediaActions(false);
              setTimeout(() => {
                if (selectedMediaSlot) {
                  setMediaUploadType(selectedMediaSlot);
                  setShowMediaModal(true);
                }
              }, 300);
            }}
            onDownload={() => {
              // Handle download in parent — it has access to the URL
              setShowMediaActions(false);
              handleMediaDownload(url, selectedMediaSlot || 'before', fileType);
            }}
          />
        );
      })()}

      {/* Full Screen Image Preview */}
      <ImagePreviewModal
        isOpen={showImagePreview}
        onClose={() => setShowImagePreview(false)}
        imageUrl={previewMediaUrl}
        title={`${selectedMediaSlot === 'before' ? 'Before' : 'After'} Photo`}
      />

      <VideoPreviewModal
        visible={showVideoPreview}
        onClose={() => setShowVideoPreview(false)}
        videoUrl={previewMediaUrl}
      />

    </View>
  );
}

const { width } = Dimensions.get('window');
const MEDIA_SIZE = (width - 40 - 12) / 2;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
    paddingBottom: 140,
  },
  chatScrollContent: {
    padding: 0,
    gap: 0,
    paddingBottom: 200,
  },
  card: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ticketNumberLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ticketTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    lineHeight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pausedText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  slaCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  slaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  slaTitle: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  slaBreachTime: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F43F5E',
  },
  slaSubtext: {
    fontSize: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginVertical: 2,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 20,
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 11,
  },
  timelineUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  timelineUserName: {
    fontSize: 10,
    fontWeight: '500',
  },
  reassignLeft: {
    alignItems: 'center',
    width: 32,
  },
  reassignAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  reassignAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
  },
  reassignLine: {
    width: 1,
    flex: 1,
    marginTop: 4,
    minHeight: 16,
  },
  reassignAction: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  reassignDetail: {
    fontSize: 11,
    marginBottom: 2,
  },
  reassignTime: {
    fontSize: 10,
  },
  escalationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  escalationItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  escLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.15)',
  },
  levelBadgeActive: {
    backgroundColor: 'rgba(244,63,94,0.15)',
  },
  levelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  levelTextActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F43F5E',
  },
  reasonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  reasonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  escTime: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  escEmployeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  escEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  escAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  escAvatarText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  escEmployeeName: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  // Sequence of Events (timeline)
  seqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  seqCount: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  seqTimeline: {
    gap: 0,
  },
  seqEvent: {
    flexDirection: 'row',
    gap: 8,
  },
  seqLeft: {
    alignItems: 'center',
    width: 20,
  },
  seqDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  seqLine: {
    width: 2,
    flex: 1,
    minHeight: 12,
    marginVertical: 2,
  },
  seqRight: {
    flex: 1,
    paddingBottom: 8,
  },
  seqCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  seqCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  seqAction: {
    fontSize: 12,
    fontWeight: '800',
  },
  seqTime: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  seqReasonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  seqReasonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  seqUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  seqAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seqAvatarText: {
    fontSize: 8,
    fontWeight: '700',
  },
  seqUserName: {
    fontSize: 11,
    fontWeight: '600',
  },
  seqNote: {
    fontSize: 11,
    marginTop: 4,
  },
  seqReassignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  seqReassignPerson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  seqReassignLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  seqReassignName: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  seqChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  seqChangeLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  seqPriorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  seqPriorityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  seqLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  seqLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  seqLevelBadgeActive: {
    backgroundColor: 'rgba(244,63,94,0.12)',
  },
  seqLevelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  seqLevelTextActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F43F5E',
  },
  seqEscEmployeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seqEscEmployee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  uploadingText: {
    fontSize: 12,
  },
  mediaGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaSlot: {
    flex: 1,
    height: MEDIA_SIZE,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mediaSlotLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assigneeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  assigneeAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  assigneeInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },
  assigneeName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  assigneeMeta: {
    fontSize: 11,
  },
  reassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  reassignBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  noAssignee: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  noAssigneeText: {
    fontSize: 13,
  },
  assignNowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  assignNowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  whatsappBackground: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 140,
  },
  whatsappChatContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  systemPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(148,163,184,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 4,
    marginTop: 4,
    alignItems: 'center',
  },
  systemPillText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  systemPillTime: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  chatRowLeft: {
    alignSelf: 'flex-start',
  },
  chatRowRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    marginRight: 6,
    marginLeft: 6,
  },
  chatAvatarText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chatAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  chatBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chatBubbleMe: {
    borderTopRightRadius: 4,
  },
  chatBubbleOther: {
    borderTopLeftRadius: 4,
  },
  chatAuthorName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  chatMessageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  chatMessageTime: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  customHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  customBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 16,
  },
  customBackText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#3B82F6',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryBlockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  primaryBlockBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  validationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  validationSubtext: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  validationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  validateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  validateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  whatsappInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  whatsappInput: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 12,
    fontSize: 15,
    maxHeight: 120,
    elevation: 0,
  },
  whatsappSendWrapper: {
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  whatsappSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00A884',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  pickerCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    maxHeight: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  noMSTText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  notFoundSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  topNavTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  navItemCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    marginTop: -24,
  },
  navIconWrapper: {
    width: 44,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  centerFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  navText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
