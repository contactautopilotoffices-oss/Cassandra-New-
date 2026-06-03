import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  FlatList,
  Platform,
  Modal,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useWeather } from '@/hooks/useWeather';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';
import WeatherBackground from '@/components/dashboard/WeatherBackground';
import TenantBottomNav from '@/components/tenant/TenantBottomNav';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  getMeetingRooms,
  getMeetingRoomBookings,
  createMeetingRoomBooking,
  cancelMeetingRoomBookingApi,
} from '@/services/meetingRoomService';
import { SPACING } from '@/constants/designSystem';
import type { MeetingRoom, MeetingRoomBooking } from '@/services/meetingRoomService';
import { MapPin, Users, Armchair } from 'lucide-react-native';

function getAmenityIcon(amenity: string): string {
  const map: Record<string, string> = {
    projector: '📽️',
    whiteboard: '📝',
    tv: '📺',
    video_conference: '🎥',
    wifi: '📶',
    coffee: '☕',
    parking: '🅿️',
    air_conditioning: '❄️',
    wheelchair_access: '♿',
    phone: '📞',
  };
  return map[amenity.toLowerCase()] || '✨';
}

function formatAmenityLabel(amenity: string): string {
  return amenity
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

const FONT_DISPLAY = Platform.select({
  web: 'Poppins, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Poppins',
  android: 'Poppins',
  default: 'Poppins',
});
const FONT_BODY = Platform.select({
  web: 'Urbanist, -apple-system, BlinkMacSystemFont, sans-serif',
  ios: 'Urbanist',
  android: 'Urbanist',
  default: 'Urbanist',
});

type TabType = 'rooms' | 'myBookings';

export default function TenantRoomsPage() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const weatherHook = useWeather();

  const [activeTab, setActiveTab] = useState<TabType>('rooms');
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<MeetingRoomBooking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);

  // Booking form state
  const [bookingTitle, setBookingTitle] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingStartTime, setBookingStartTime] = useState('');
  const [bookingEndTime, setBookingEndTime] = useState('');
  const [bookingAttendees, setBookingAttendees] = useState('');

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const [roomsRes, bookingsRes] = await Promise.all([
        getMeetingRooms(propertyId as string),
        getMeetingRoomBookings(propertyId as string),
      ]);
      if (roomsRes.rooms) setRooms(roomsRes.rooms);
      if (bookingsRes.bookings) setBookings(bookingsRes.bookings);
    } catch (err) {
      console.error('[TenantRooms] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, user?.id]);

  const { refetch } = useDashboardFetch(queryKeys.property.tenantRooms(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const handleBookRoom = async () => {
    if (!selectedRoom || !bookingTitle || !bookingDate || !bookingStartTime || !bookingEndTime) {
      Alert.alert('Missing Info', 'Please fill in all required fields.');
      return;
    }
    try {
      const startTime = new Date(`${bookingDate}T${bookingStartTime}`).toISOString();
      const endTime = new Date(`${bookingDate}T${bookingEndTime}`).toISOString();

      const res = await createMeetingRoomBooking({
        meetingRoomId: selectedRoom.id,
        propertyId: propertyId as string,
        date: bookingDate,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
      });

      if (res.success) {
        Alert.alert('Success', 'Room booked successfully!');
        setShowBookingModal(false);
        resetBookingForm();
        fetchData();
      } else {
        Alert.alert('Error', res.error || 'Could not book room. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong.');
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    Alert.alert('Cancel Booking', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          await cancelMeetingRoomBookingApi(bookingId);
          fetchData();
        },
      },
    ]);
  };

  const resetBookingForm = () => {
    setBookingTitle('');
    setBookingDate('');
    setBookingStartTime('');
    setBookingEndTime('');
    setBookingAttendees('');
    setSelectedRoom(null);
  };

  const openBookingModal = (room: MeetingRoom) => {
    setSelectedRoom(room);
    const today = new Date().toISOString().split('T')[0];
    setBookingDate(today);
    setBookingStartTime('09:00');
    setBookingEndTime('10:00');
    setShowBookingModal(true);
  };

  const renderRoomCard = ({ item }: { item: MeetingRoom }) => {
    const amenities = item.amenities?.slice(0, 3) || [];
    const extraCount = (item.amenities?.length || 0) - 3;
    const isAvailable = item.status === 'available';

    return (
      <TouchableOpacity 
        style={styles.cardWrapper} 
        onPress={() => isAvailable ? openBookingModal(item) : Alert.alert('Unavailable', 'This room is not currently available.')} 
        activeOpacity={0.75}
      >
        <SafeBlurView intensity={60} style={styles.roomCard} tint="dark">
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)']}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Photo */}
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
              <Armchair size={32} color="rgba(255,255,255,0.3)" />
            </View>
          )}

          {/* Status Badge Over Image */}
          <View style={[styles.statusBadgeOverlay, { backgroundColor: isAvailable ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)' }]}>
            <Text style={styles.statusTextOverlay}>
              {isAvailable ? 'Available' : item.status || 'Unknown'}
            </Text>
          </View>

          {/* Content */}
          <View style={styles.roomContent}>
            <Text style={styles.roomName} numberOfLines={1}>
              {item.name || 'Unnamed Room'}
            </Text>
            
            <View style={styles.cardMetaRow}>
              <View style={styles.cardMetaItem}>
                <MapPin size={12} color="#708F96" />
                <Text style={styles.cardMetaText} numberOfLines={1}>
                  {item.location || 'Main Building'}
                </Text>
              </View>
              <View style={styles.cardMetaItem}>
                <Users size={12} color="#708F96" />
                <Text style={styles.cardMetaText}>{item.capacity} people</Text>
              </View>
            </View>

            {/* Amenities */}
            {amenities.length > 0 && (
              <View style={styles.amenityRow}>
                {amenities.map((a) => (
                  <View key={a} style={styles.amenityChip}>
                    <Text style={styles.amenityEmoji}>{getAmenityIcon(a)}</Text>
                    <Text style={styles.amenityText}>{formatAmenityLabel(a)}</Text>
                  </View>
                ))}
                {extraCount > 0 && (
                  <View style={styles.amenityChip}>
                    <Text style={styles.amenityText}>+{extraCount} more</Text>
                  </View>
                )}
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.bookBtn, !isAvailable && styles.bookBtnDisabled]}
              onPress={() => openBookingModal(item)}
              disabled={!isAvailable}
              activeOpacity={0.8}
            >
              <Text style={styles.bookBtnText}>
                {isAvailable ? 'Book Now' : 'Unavailable'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    );
  };

  const renderBookingCard = ({ item }: { item: MeetingRoomBooking }) => (
    <SafeBlurView intensity={40} style={styles.roomCard} tint="dark">
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.roomContent}>
        <View style={styles.roomHeader}>
          <View style={[styles.roomIconWrap, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <Ionicons name="calendar" size={22} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roomName}>{item.meeting_room?.name || 'Untitled Booking'}</Text>
            <Text style={styles.roomLocation}>
              {item.booking_date || 'No date'} · {item.start_time || ''} - {item.end_time || ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Text style={[styles.statusText, { color: '#10B981' }]}>{item.status || 'Booked'}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.bookBtn, { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.4)' }]}
          onPress={() => handleCancelBooking(item.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.bookBtnText, { color: '#FCA5A5' }]}>Cancel Booking</Text>
        </TouchableOpacity>
      </View>
    </SafeBlurView>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1a1a1a', '#121212', '#0a0a0a']} style={StyleSheet.absoluteFillObject} />
      {weatherHook.weather && <WeatherBackground condition={weatherHook.weather.condition} />}

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Rooms</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rooms' && styles.tabActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.tabTextActive]}>All Rooms</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'myBookings' && styles.tabActive]}
          onPress={() => setActiveTab('myBookings')}
        >
          <Text style={[styles.tabText, activeTab === 'myBookings' && styles.tabTextActive]}>My Bookings</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'rooms' ? (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="rgba(255,255,255,0.6)" />}
          contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderRoomCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>No meeting rooms</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="rgba(255,255,255,0.6)" />}
          contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderBookingCard}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySubtitle}>Book a room from the All Rooms tab</Text>
            </View>
          }
        />
      )}

      <TenantBottomNav />

      {/* Booking Modal */}
      <Modal visible={showBookingModal} transparent animationType="slide" onRequestClose={() => setShowBookingModal(false)}>
        <View style={styles.modalOverlay}>
          <SafeBlurView intensity={60} style={styles.modalSheet} tint="dark">
            <LinearGradient
              colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book {selectedRoom?.name}</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Meeting Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Weekly Standup"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={bookingTitle}
              onChangeText={setBookingTitle}
            />

            <Text style={styles.inputLabel}>Date *</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={bookingDate}
              onChangeText={setBookingDate}
            />

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start Time *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="09:00"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={bookingStartTime}
                  onChangeText={setBookingStartTime}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End Time *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10:00"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={bookingEndTime}
                  onChangeText={setBookingEndTime}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Attendees (comma separated)</Text>
            <TextInput
              style={styles.input}
              placeholder="john@example.com, jane@example.com"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={bookingAttendees}
              onChangeText={setBookingAttendees}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleBookRoom} activeOpacity={0.8}>
              <Text style={styles.submitBtnText}>Confirm Booking</Text>
            </TouchableOpacity>
          </SafeBlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    fontFamily: FONT_BODY,
    color: '#FFFFFF',
  },
  cardWrapper: {
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  roomCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardImage: {
    width: '100%',
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTextOverlay: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  roomContent: {
    padding: 16,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roomIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  roomLocation: {
    fontSize: 13,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardMetaText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
  },
  amenityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  amenityEmoji: {
    fontSize: 11,
  },
  amenityText: {
    fontSize: 11,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
  },
  bookBtn: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bookBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#FCD34D',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inputLabel: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
  },
  submitBtn: {
    backgroundColor: '#708F96',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
