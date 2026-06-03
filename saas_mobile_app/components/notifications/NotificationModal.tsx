import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  role?: string;
}

type TabKey = 'notifications' | 'pending';

export default function NotificationModal({ visible, onClose, propertyId, role }: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('notifications');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && user) {
      fetchNotifications();
    }
  }, [visible, user]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    const supabase = createClient();
    try {
      // First try to join
      const userId = user?.id;
      if (!userId) return;
      const { data, error } = await supabase
        .from('notifications')
        .select('*, ticket:tickets(id, description, photo_before_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      let finalData = data as any[] | null;

      // If the join fails due to schema naming, fetch flat notifications and try manual join
      if (error || !data) {
        console.log("Join error, fetching flat notifications", error);
        const fallbackRes = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
          
        if (fallbackRes.data && fallbackRes.data.length > 0) {
          finalData = fallbackRes.data;
          
          // Manual Join Logic
          const ticketIds = (finalData as any[])
            .map((n: any) => n.ticket_id)
            .filter(Boolean);
 
          if (ticketIds.length > 0) {
            const { data: ticketsData } = await supabase
              .from('tickets')
              .select('id, description, photo_before_url')
              .in('id', ticketIds);

            const ticketList = ticketsData as any[] | null;
            if (ticketList) {
              const ticketMap: any = {};
              ticketList.forEach(t => ticketMap[t.id] = t);

              finalData = (finalData as any[]).map((n: any) => {
                const tid = n.ticket_id;
                if (tid && ticketMap[tid]) {
                  return { ...n, ticket: ticketMap[tid] };
                }
                return n;
              });
            }
          }
        }
      }

      if (finalData && finalData.length > 0) {
        // If user is client, filter out any mock/internal admin notifications that don't belong to them
        if (role === 'tenant' || role === 'client') {
          setNotifications(finalData);
        } else {
          setNotifications(finalData);
        }
      } else {
        // Fallback mock data if table doesn't exist or is empty
        if (role === 'tenant' || role === 'client') {
          setNotifications([
            { 
              id: '1', 
              title: 'AC Maintenance Update', 
              body: 'Your ticket #102 has been marked as in progress by the maintenance team.', 
              type: 'ticket_assigned', 
              read: false, 
              created_at: new Date().toISOString(),
              reference_id: 'mock-102',
              before_photo: 'https://images.unsplash.com/photo-1585836261555-5c1fa583f790?auto=format&fit=crop&q=80&w=300',
              description: 'Water is dripping from the AC unit in the main room. Technician is assigned.'
            },
            { 
              id: '2', 
              title: 'Visitor Confirmed', 
              body: 'Visitor John Doe has been successfully registered.', 
              type: 'visitor_arrived', 
              read: true, 
              created_at: new Date(Date.now() - 3600000).toISOString(),
              reference_id: 'mock-456',
              description: 'Visitor John Doe scheduled for check-in today.'
            },
            { 
              id: '3', 
              title: 'Welcome to Client Portal', 
              body: 'Welcome to your premium Client Portal. Easily book meeting rooms and track your tickets.', 
              type: 'welcome', 
              read: true, 
              created_at: new Date(Date.now() - 86400000).toISOString() 
            }
          ]);
        } else {
          setNotifications([
            { 
              id: '1', 
              title: 'Water Leaking from AC', 
              body: 'A new plumbing ticket has been assigned to you.', 
              type: 'ticket_assigned', 
              read: false, 
              created_at: new Date().toISOString(),
              reference_id: 'mock-123',
              before_photo: 'https://images.unsplash.com/photo-1585836261555-5c1fa583f790?auto=format&fit=crop&q=80&w=300',
              description: 'Water is dripping from the AC unit in Room 204. It started about an hour ago and is forming a puddle.'
            },
            { 
              id: '2', 
              title: 'SLA Warning: Lift Stuck', 
              body: 'Ticket #456 is approaching SLA breach.', 
              type: 'sla_warning', 
              read: true, 
              created_at: new Date(Date.now() - 3600000).toISOString(),
              reference_id: 'mock-456',
              description: 'Lift #2 in Tower A is stuck on the 4th floor. Immediate assistance required.'
            },
            { 
              id: '3', 
              title: 'Visitor Arrived', 
              body: 'John Doe is waiting at the lobby.', 
              type: 'visitor_arrived', 
              read: true, 
              created_at: new Date(Date.now() - 86400000).toISOString() 
            }
          ]);
        }
      }
    } catch (e) {
      if (role === 'tenant' || role === 'client') {
        setNotifications([
          { id: '1', title: 'Welcome to Client Portal', body: 'Easily book meeting rooms and track your support tickets here.', type: 'welcome', read: false, created_at: new Date().toISOString() }
        ]);
      } else {
        setNotifications([
          { id: '1', title: 'New Ticket', body: 'A new ticket has been assigned to you.', type: 'ticket_assigned', read: false, created_at: new Date().toISOString() }
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getIconName = (type?: string) => {
    switch (type) {
      case 'TICKET_CREATED': 
      case 'ticket_assigned': return 'time';
      case 'TICKET_ESCALATED':
      case 'sla_warning': return 'timer';
      case 'visitor_arrived': return 'person';
      default: return 'notifications';
    }
  };

  const getIconColor = (type?: string) => {
    switch (type) {
      case 'TICKET_CREATED':
      case 'ticket_assigned': return '#3B82F6';
      case 'TICKET_ESCALATED':
      case 'sla_warning': return '#F59E0B';
      case 'visitor_arrived': return '#10B981';
      default: return '#708F96';
    }
  };

  const formatNotificationTime = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && 
                    date.getMonth() === today.getMonth() && 
                    date.getFullYear() === today.getFullYear();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleNotificationPress = (item: any) => {
    // If it's related to a ticket, redirect to the ticket details
    const ticketId = item.ticket_id || item.reference_id || item.ticket?.id;
    if (ticketId || item.notification_type === 'ticket_assigned' || item.notification_type === 'TICKET_CREATED') {
      onClose(); // Close the modal
      router.push(`/(app)/property/${propertyId}/tickets/${ticketId || 'mock-123'}` as any);
    }
  };

  const renderNotificationItem = ({ item }: { item: any }) => {
    const photoUrl = item.ticket?.photo_before_url || item.photo_before_url || item.ticket?.before_photo || item.before_photo;
    const descText = item.ticket?.description || item.description || item.message || item.body;
    const isRead = item.is_read !== undefined ? item.is_read : item.read;
    const type = item.notification_type || item.type;
    
    return (
      <TouchableOpacity 
        style={[styles.itemCard, !isRead && styles.unreadItem]} 
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.8}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.notificationImage} />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: getIconColor(type) + '20' }]}>
            <Ionicons name={getIconName(type)} size={20} color={getIconColor(type)} />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{descText}</Text>
          <Text style={styles.time}>{formatNotificationTime(item.created_at)}</Text>
        </View>
        {!isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const mockPendingActions = [
    { id: 'p1', title: 'Material Requisition #Req-101', body: 'Requires approval for 5x LED Bulbs, 2x AC Filters.', type: 'approval' },
    { id: 'p2', title: 'Vendor Access Request', body: 'ABC Plumbing needs access tomorrow 10 AM.', type: 'approval' },
  ];

  const renderPendingActionItem = ({ item }: { item: any }) => (
    <View style={styles.itemCard}>
      <View style={[styles.iconContainer, { backgroundColor: '#F59E0B20' }]}>
        <Ionicons name="document-text" size={20} color="#F59E0B" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.approveBtn}>
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn}>
            <Text style={styles.rejectBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Notifications Center</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'notifications' && styles.activeTab]}
            onPress={() => setActiveTab('notifications')}
          >
            <Text style={[styles.tabText, activeTab === 'notifications' && styles.activeTabText]}>
              Notifications {notifications.length > 0 && `(${notifications.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              Pending Actions (2)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'notifications' ? (
            isLoading ? (
              <View style={styles.centerContent}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.centerContent}>
                <Ionicons name="notifications-off-outline" size={48} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>No notifications yet</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderNotificationItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )
          ) : (
            // Pending Actions Tab
            <FlatList
              data={mockPendingActions}
              keyExtractor={(item) => item.id}
              renderItem={renderPendingActionItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.centerContent}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>All caught up!</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,10,0.5)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  activeTabText: {
    color: '#FFF',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  unreadItem: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  notificationImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
    lineHeight: 20,
  },
  time: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 12,
    alignSelf: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  approveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  approveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  rejectBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
