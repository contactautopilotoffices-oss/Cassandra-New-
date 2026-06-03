import React, { useState, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useTheme } from '@/context';
import { GlassCard } from '@/constants/designSystem';
import {
  listPendingApprovals,
  updateMaterialRequestStatus,
  type MaterialRequest,
} from '@/utils/api/mobileApi';

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  deep_link: string;
  ticket_id?: string;
  is_read: boolean;
  created_at: string;
}

type FilterTab = 'all' | 'unread';

function getTimeAgo(dateStr: string) {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function getIconName(type: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    TICKET_CREATED: 'alert-circle-outline',
    TICKET_ASSIGNED: 'time-outline',
    TICKET_COMPLETED: 'checkmark-circle-outline',
    TICKET_CRITICAL: 'warning-outline',
    TICKET_PENDING_VALIDATION: 'eye-outline',
    TICKET_ESCALATED: 'trending-up-outline',
    SLA_BREACH: 'flash-outline',
    SLA_WARNING: 'timer-outline',
    MATERIAL_REQUEST_PENDING: 'cube-outline',
    MATERIAL_REQUEST_ASSIGNED: 'cube-outline',
    MATERIAL_REQUEST_STATUS_CHANGE: 'cube-outline',
    ROOM_BOOKED: 'calendar-outline',
    VISITOR_CHECKED_IN: 'person-outline',
    SOP_REMINDER: 'clipboard-outline',
    SOP_RATING: 'star-outline',
    PPM_REMINDER: 'construct-outline',
  };
  return map[type] || 'information-circle-outline';
}

function getIconColor(type: string): string {
  const map: Record<string, string> = {
    TICKET_CRITICAL: '#EF4444',
    SLA_BREACH: '#EF4444',
    TICKET_CREATED: '#2997FF',
    TICKET_COMPLETED: '#10B981',
    MATERIAL_REQUEST_PENDING: '#FF9F0A',
    MATERIAL_REQUEST_STATUS_CHANGE: '#AF52DE',
    SLA_WARNING: '#FF9F0A',
  };
  return map[type] || '#708F96';
}

function convertDeepLink(deepLink: string, pid?: string): string {
  if (deepLink.includes('/procurement')) {
    return pid ? `/property/${pid}/stock` : '/property/all/dashboard';
  }
  if (deepLink.includes('/tickets/')) {
    const match = deepLink.match(/\/tickets\/([^?]+)/);
    if (match) return `/property/${pid}/tickets/${match[1]}`;
  }
  if (deepLink.includes('/security')) {
    return pid ? `/property/${pid}/security` : '/property/all/dashboard';
  }
  if (deepLink.includes('/visitors')) {
    return pid ? `/property/${pid}/visitors` : '/property/all/dashboard';
  }
  return pid ? `/property/${pid}/dashboard` : '/property/all/dashboard';
}

function groupByDate(notifications: Notification[]) {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups = { today: [] as Notification[], yesterday: [] as Notification[], earlier: [] as Notification[] };
  for (const n of notifications) {
    const d = new Date(n.created_at.endsWith('Z') ? n.created_at : n.created_at + 'Z');
    const ds = d.toDateString();
    if (ds === todayStr) groups.today.push(n);
    else if (ds === yesterdayStr) groups.yesterday.push(n);
    else groups.earlier.push(n);
  }
  return groups;
}

// ------------------------------------------------------------------
// Inline Approval Sheet
// ------------------------------------------------------------------
function InlineApprovalSheet({
  visible,
  onClose,
  onApprove,
  onReject,
  loading,
  requests,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onApprove: (reqId: string) => void;
  onReject: (reqId: string) => void;
  loading: boolean;
  requests: MaterialRequest[];
  isDark: boolean;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="slide" statusBarTranslucent>
      <View style={[styles.approvalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)' }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <GlassCard style={styles.approvalSheet}>
          <Text style={[styles.approvalTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
            Select Request to Review
          </Text>
          <Text style={[styles.approvalSubtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
            {requests.length} pending {requests.length === 1 ? 'request' : 'requests'}
          </Text>

          {loading ? (
            <ActivityIndicator size="small" color="#708F96" style={{ marginVertical: 20 }} />
          ) : requests.length === 0 ? (
            <Text style={[styles.emptyText, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)', marginVertical: 20 }]}>
              No pending requests found
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {requests.map((item) => (
                <View key={item.id} style={[styles.approvalItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.approvalItemTitle, { color: isDark ? '#E6EBEE' : '#1D1D1F' }]} numberOfLines={1}>
                      {item.ticket?.ticket_number || 'Request'}
                    </Text>
                    <Text style={[styles.approvalItemMeta, { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' }]}>
                      {item.requester?.full_name || 'Unknown'} · ₹{item.total_amount?.toLocaleString() ?? 0}
                    </Text>
                  </View>
                  <View style={styles.approvalItemActions}>
                    <TouchableOpacity
                      style={[styles.inlineActionBtn, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }]}
                      onPress={() => onReject(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inlineActionBtn, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }]}
                      onPress={() => onApprove(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.approvalCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.approvalCloseText}>Close</Text>
          </TouchableOpacity>
        </GlassCard>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Notification Item
// ------------------------------------------------------------------
const NotificationItem = memo(function NotificationItem({
  notification,
  isDark,
  canApprove,
  actionLoading,
  onPress,
  onAction,
}: {
  notification: Notification;
  isDark: boolean;
  canApprove: boolean;
  actionLoading: string | null;
  onPress: (n: Notification) => void;
  onAction: (n: Notification, status: 'approved' | 'rejected') => void;
}) {
  const isMaterialPending = notification.notification_type === 'MATERIAL_REQUEST_PENDING' && canApprove;
  const iconColor = getIconColor(notification.notification_type);

  return (
    <View style={[styles.notifItem, !notification.is_read && styles.notifUnread]}>
      <TouchableOpacity style={styles.notifMain} onPress={() => onPress(notification)} activeOpacity={0.6}>
        <View style={[styles.notifIcon, { backgroundColor: `${iconColor}12`, borderColor: `${iconColor}20` }]}>
          <Ionicons name={getIconName(notification.notification_type)} size={18} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.notifTitle, !notification.is_read && { color: isDark ? '#F8FAFC' : '#1A2332' }, isDark && notification.is_read && { color: 'rgba(230,235,238,0.6)' }]}>
            {notification.title}
          </Text>
          <Text style={[styles.notifMessage, isDark && { color: 'rgba(230,235,238,0.45)' }]} numberOfLines={2}>
            {notification.message}
          </Text>
          <Text style={[styles.notifTime, isDark && { color: 'rgba(230,235,238,0.3)' }]}>
            {getTimeAgo(notification.created_at)}
          </Text>
        </View>
        {!notification.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>

      {isMaterialPending && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onAction(notification, 'rejected')}
            disabled={actionLoading === notification.id}
            activeOpacity={0.7}
          >
            {actionLoading === notification.id ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="close-circle" size={14} color="#EF4444" />
                <Text style={styles.rejectText}>Reject</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => onAction(notification, 'approved')}
            disabled={actionLoading === notification.id}
            activeOpacity={0.7}
          >
            {actionLoading === notification.id ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.approveText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

// ------------------------------------------------------------------
// Notification List Modal (isolated component)
// ------------------------------------------------------------------
function NotificationModal({
  visible,
  onClose,
  notifications,
  unreadCount,
  isLoading,
  refreshing,
  onRefresh,
  onMarkAllRead,
  onMarkRead,
  onNotificationPress,
  onMaterialAction,
  actionLoading,
  canApprove,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onNotificationPress: (n: Notification) => void;
  onMaterialAction: (n: Notification, status: 'approved' | 'rejected') => void;
  actionLoading: string | null;
  canApprove: boolean;
  isDark: boolean;
}) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const filtered = activeTab === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const grouped = groupByDate(filtered);

  const hasItems = grouped.today.length > 0 || grouped.yesterday.length > 0 || grouped.earlier.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <GlassCard style={[styles.modalContent, isDark ? { backgroundColor: 'rgba(30,30,30,0.95)' } : {}]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Notifications</Text>
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={onMarkAllRead}>
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={isDark ? 'rgba(230,235,238,0.6)' : '#64748B'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Filter Tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]} onPress={() => setActiveTab('all')} activeOpacity={0.8}>
              <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'unread' && styles.tabBtnActive]} onPress={() => setActiveTab('unread')} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>Unread</Text>
                {unreadCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* List */}
          {isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color="#708F96" />
            </View>
          ) : !hasItems ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={40} color={isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0'} />
              <Text style={[styles.emptyText, isDark && { color: 'rgba(230,235,238,0.4)' }]}>
                {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </Text>
              {activeTab === 'unread' && notifications.length > 0 && (
                <TouchableOpacity onPress={() => setActiveTab('all')} style={{ marginTop: 8 }}>
                  <Text style={styles.emptyAction}>View all notifications</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#708F96" colors={['#708F96']} />}
            >
              {grouped.today.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { color: isDark ? 'rgba(230,235,238,0.35)' : 'rgba(26,35,50,0.35)' }]}>TODAY</Text>
                  {grouped.today.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      isDark={isDark}
                      canApprove={canApprove}
                      actionLoading={actionLoading}
                      onPress={onNotificationPress}
                      onAction={onMaterialAction}
                    />
                  ))}
                </>
              )}
              {grouped.yesterday.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { color: isDark ? 'rgba(230,235,238,0.35)' : 'rgba(26,35,50,0.35)' }]}>YESTERDAY</Text>
                  {grouped.yesterday.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      isDark={isDark}
                      canApprove={canApprove}
                      actionLoading={actionLoading}
                      onPress={onNotificationPress}
                      onAction={onMaterialAction}
                    />
                  ))}
                </>
              )}
              {grouped.earlier.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { color: isDark ? 'rgba(230,235,238,0.35)' : 'rgba(26,35,50,0.35)' }]}>EARLIER</Text>
                  {grouped.earlier.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      isDark={isDark}
                      canApprove={canApprove}
                      actionLoading={actionLoading}
                      onPress={onNotificationPress}
                      onAction={onMaterialAction}
                    />
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </GlassCard>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Main NotificationBell Component
// ------------------------------------------------------------------
export default function NotificationBell({ style, iconColor, iconSize }: { style?: any; iconColor?: string; iconSize?: number }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showApprovalSheet, setShowApprovalSheet] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<MaterialRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const router = useRouter();
  const { user: authUser, membership } = useAuth();
  const { theme } = useTheme();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { capabilities } = useCapabilities(propertyId);
  const isDark = theme === 'dark';
  const canApprove = capabilities.procurement?.includes('approve') ?? false;

  // Badge bounce
  useEffect(() => {
    if (unreadCount > 0) {
      Animated.sequence([
        Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [unreadCount]);

  // Fetch + realtime
  useEffect(() => {
    let channel: any;
    let mounted = true;

    const fetch = async () => {
      if (!authUser?.id || !mounted) return;
      setIsLoading(true);
      const { data, error } = await serverApi.query({ table: 'notifications', action: 'select', filters: [{ op: 'eq', column: 'user_id', value: authUser.id }], orders: [{ column: 'created_at', ascending: false }], limit: 50 });
      if (mounted && !error && data) {
        setNotifications(data as Notification[]);
        setUnreadCount((data as any[]).filter((n: any) => !n.is_read).length);
      }
      if (mounted) setIsLoading(false);
    };

    fetch();

    if (authUser?.id) {
      channel = supabase
        .channel(`notif-bell-${authUser.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${authUser.id}` }, (payload) => {
          if (!mounted) return;
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          setUnreadCount((count) => count + 1);
        })
        .subscribe();
    }

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, authUser?.id]);

  const markAsRead = async (id: string) => {
    const { error } = await serverApi.query({ table: 'notifications', action: 'update', values: { is_read: true }, filters: [{ op: 'eq', column: 'id', value: id }] });
    if (!error) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  };

  const markAllAsRead = async () => {
    if (!authUser?.id) return;
    const { error } = await serverApi.query({ table: 'notifications', action: 'update', values: { is_read: true }, filters: [{ op: 'eq', column: 'user_id', value: authUser.id }, { op: 'not', column: 'is_read', operator: 'eq', value: true }] });
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  };

  const handleNotificationPress = (notif: Notification) => {
    setIsOpen(false);
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.ticket_id) {
      router.push(`/property/${propertyId}/tickets/${notif.ticket_id}` as any);
    } else if (notif.deep_link) {
      router.push(convertDeepLink(notif.deep_link, propertyId) as any);
    }
  };

  const handleMaterialAction = async (notif: Notification, status: 'approved' | 'rejected') => {
    if (!canApprove || !authUser?.id) return;
    setActionLoading(notif.id);
    setPendingLoading(true);
    setShowApprovalSheet(true);

    try {
      const orgId = membership?.org_id ?? undefined;
      const requests = await listPendingApprovals(authUser.id, propertyId, orgId);
      const pending = requests.filter((r) =>
        r.status === 'pending_approval' || r.status === 'pending' || r.status === 'pending_quotation'
      );
      setPendingRequests(pending);

      if (pending.length === 1) {
        const req = pending[0];
        setShowApprovalSheet(false);
        Alert.alert(
          status === 'approved' ? 'Approve Request' : 'Reject Request',
          `${req.ticket?.ticket_number || 'Request'} — ₹${req.total_amount?.toLocaleString() ?? 0}\n\nAre you sure?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setActionLoading(null) },
            {
              text: status === 'approved' ? 'Approve' : 'Reject',
              style: status === 'approved' ? 'default' : 'destructive',
              onPress: async () => {
                try {
                  await updateMaterialRequestStatus(req.id, status);
                  markAsRead(notif.id);
                  setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                  setUnreadCount((c) => Math.max(0, c - 1));
                } catch (err: any) {
                  Alert.alert('Error', err.message || 'Failed to update request');
                } finally {
                  setActionLoading(null);
                }
              },
            },
          ]
        );
        return;
      }

      if (pending.length === 0) {
        setShowApprovalSheet(false);
        Alert.alert('No Pending Requests', 'There are no material requests waiting for your approval.');
        setActionLoading(null);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch pending approvals');
      setShowApprovalSheet(false);
      setActionLoading(null);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleSheetApprove = async (reqId: string) => {
    try {
      await updateMaterialRequestStatus(reqId, 'approved');
      setShowApprovalSheet(false);
      setActionLoading(null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotifications((prev) => prev.filter((n) => n.notification_type !== 'MATERIAL_REQUEST_PENDING'));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve');
      setActionLoading(null);
    }
  };

  const handleSheetReject = async (reqId: string) => {
    try {
      await updateMaterialRequestStatus(reqId, 'rejected');
      setShowApprovalSheet(false);
      setActionLoading(null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNotifications((prev) => prev.filter((n) => n.notification_type !== 'MATERIAL_REQUEST_PENDING'));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject');
      setActionLoading(null);
    }
  };

  return (
    <>
      <TouchableOpacity style={[styles.bellButton, style]} onPress={() => setIsOpen(true)}>
        <Ionicons name="notifications-outline" size={iconSize ?? 22} color={iconColor ?? (isDark ? 'rgba(230,235,238,0.6)' : '#64748B')} />
        {unreadCount > 0 && (
          <Animated.View
            style={[styles.badge, { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }]}
          >
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>

      <NotificationModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setIsLoading(true);
          const uid = authUser?.id;
          if (!uid) return;
          serverApi.query({ table: 'notifications', action: 'select', filters: [{ op: 'eq', column: 'user_id', value: uid }], orders: [{ column: 'created_at', ascending: false }], limit: 50 }).then(({ data, error }: any) => {
            if (!error && data) {
              setNotifications(data);
              setUnreadCount(data.filter((n: any) => !n.is_read).length);
            }
            setIsLoading(false);
            setRefreshing(false);
          });
        }}
        onMarkAllRead={markAllAsRead}
        onMarkRead={markAsRead}
        onNotificationPress={handleNotificationPress}
        onMaterialAction={handleMaterialAction}
        actionLoading={actionLoading}
        canApprove={canApprove}
        isDark={isDark}
      />

      <InlineApprovalSheet
        visible={showApprovalSheet}
        onClose={() => { setShowApprovalSheet(false); setActionLoading(null); }}
        onApprove={handleSheetApprove}
        onReject={handleSheetReject}
        loading={pendingLoading}
        requests={pendingRequests}
        isDark={isDark}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF4B6B',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    shadowColor: '#FF4B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    minHeight: '40%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(112,143,150,0.1)',
  },
  modalTitle: {
        fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllText: {
        fontSize: 13,
    fontWeight: '600',
    color: '#708F96',
  },
  closeButton: {
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  tabBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(112,143,150,0.08)',
  },
  tabBtnActive: {
    backgroundColor: '#708F96',
  },
  tabText: {
        fontSize: 13,
    fontWeight: '600',
    color: '#708F96',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sectionHeader: {
        fontSize: 10,
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
        fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
  emptyAction: {
        fontSize: 13,
    fontWeight: '600',
    color: '#708F96',
  },
  notifItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(112,143,150,0.08)',
  },
  notifUnread: {
    backgroundColor: 'rgba(41,151,255,0.03)',
  },
  notifMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    paddingHorizontal: 20,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  notifTitle: {
        fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 2,
  },
  notifMessage: {
        fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  notifTime: {
        fontSize: 11,
    fontWeight: '500',
    color: '#CBD5E1',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#708F96',
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderColor: 'rgba(239,68,68,0.18)',
  },
  rejectText: {
        fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  approveBtn: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderColor: 'rgba(16,185,129,0.18)',
  },
  approveText: {
        fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  approvalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  approvalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  approvalTitle: {
        fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  approvalSubtitle: {
        fontSize: 13,
    marginBottom: 16,
  },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  approvalItemTitle: {
        fontSize: 13,
    fontWeight: '600',
  },
  approvalItemMeta: {
        fontSize: 12,
    marginTop: 2,
  },
  approvalItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  approvalCloseBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(112,143,150,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  approvalCloseText: {
        fontSize: 15,
    fontWeight: '700',
    color: '#708F96',
  },
});
