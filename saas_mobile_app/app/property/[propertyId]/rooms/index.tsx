import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import Toast from '@/components/ui/Toast';
import {
  getMeetingRooms,
  getMeetingRoomBookings,
  getMeetingRoomCredits,
  createMeetingRoomBooking,
  cancelMeetingRoomBookingApi,
  deleteMeetingRoomApi,
  MeetingRoom,
  MeetingRoomBooking,
  MeetingRoomCredit,
} from '@/services/meetingRoomService';
import { useMeetingRoomStore } from '@/stores/meetingRoomStore';
import {
  ChevronLeft,
  Settings2,
  Users,
  MapPin,
  Clock,
  CalendarDays,
  Armchair,
  CheckCircle2,
  X,
  CreditCard,
  Plus,
  Trash2,
} from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomWithBookings extends MeetingRoom {
  todayBookings: MeetingRoomBooking[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  { label: '09:00 AM', start: '09:00', end: '10:00' },
  { label: '10:15 AM', start: '10:15', end: '11:15' },
  { label: '11:30 AM', start: '11:30', end: '12:30' },
  { label: '12:00 PM', start: '12:00', end: '13:00' },
  { label: '01:00 PM', start: '13:00', end: '14:00' },
  { label: '03:00 PM', start: '15:00', end: '16:00' },
  { label: '05:00 PM', start: '17:00', end: '18:00' },
  { label: '06:00 PM', start: '18:00', end: '19:00' },
  { label: '07:00 PM', start: '19:00', end: '20:00' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSlotBooked(
  roomId: string,
  date: Date,
  startTime: string,
  endTime: string,
  bookings: MeetingRoomBooking[]
): boolean {
  const dateStr = format(date, 'yyyy-MM-dd');
  return bookings.some(
    (b) =>
      b.meeting_room_id === roomId &&
      b.booking_date === dateStr &&
      b.status === 'confirmed' &&
      b.start_time < endTime &&
      b.end_time > startTime
  );
}

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

// ─── Room Card ────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  onPress,
}: {
  room: MeetingRoom;
  onPress: () => void;
}) {
  const amenities = room.amenities?.slice(0, 3) || [];
  const extraCount = (room.amenities?.length || 0) - 3;

  return (
    <TouchableOpacity style={styles.cardWrapper} onPress={onPress} activeOpacity={0.75}>
      <SafeBlurView intensity={60} tint="dark" style={styles.card}>
        <LinearGradient
          colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.05)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Photo */}
        {room.photo_url ? (
          <Image source={{ uri: room.photo_url }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Armchair size={32} color="rgba(255,255,255,0.3)" />
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={styles.cardName} numberOfLines={1}>
            {room.name}
          </Text>
          <View style={styles.cardMetaRow}>
            <View style={[styles.cardMetaItem, { flex: 1, flexShrink: 1 }]}>
              <MapPin size={12} color="#708F96" />
              <Text style={[styles.cardMetaText, { flexShrink: 1 }]} numberOfLines={2}>
                {room.location || 'Main Building'}
              </Text>
            </View>
            <View style={[styles.cardMetaItem, { flexShrink: 0 }]}>
              <Users size={12} color="#708F96" />
              <Text style={[styles.cardMetaText, { flexShrink: 0 }]}>{room.capacity} people</Text>
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
        </View>
      </SafeBlurView>
    </TouchableOpacity>
  );
}

// ─── Room Detail Bottom Sheet ─────────────────────────────────────────────────

function RoomDetailSheet({
  room,
  bookings,
  credit,
  isAdmin,
  bottomSheetRef,
  onBook,
  onEdit,
  onDelete,
}: {
  room: MeetingRoom | null;
  bookings: MeetingRoomBooking[];
  credit: MeetingRoomCredit | null;
  isAdmin: boolean;
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onBook: (success: boolean, msg?: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const snapPoints = useMemo(() => ['65%', '85%'], []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<(typeof TIME_SLOTS)[0] | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Reset selection when room changes
  useEffect(() => {
    setSelectedDate(new Date());
    setSelectedSlot(null);
  }, [room?.id]);

  const dateOptions = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(addDays(new Date(), i));
    }
    return dates;
  }, []);

  async function handleBook(overrideSlot?: typeof TIME_SLOTS[0]) {
    const targetSlot = (overrideSlot && overrideSlot.start) ? overrideSlot : selectedSlot;
    if (!room || !targetSlot) return;
    setBookingLoading(true);
    try {
      const response = await createMeetingRoomBooking({
        meetingRoomId: room.id,
        propertyId: room.property_id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: targetSlot.start,
        endTime: targetSlot.end,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      setSelectedSlot(null);
      bottomSheetRef.current?.dismiss();
      onBook(true, `Room booked for ${targetSlot.label}`);
    } catch (err: any) {
      onBook(false, err.message || 'Could not book this room.');
    } finally {
      setBookingLoading(false);
    }
  }

  if (!room) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#0B0F1A' }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.25)', width: 40 }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
        {/* Header */}
        <LinearGradient colors={['rgba(112,143,150,0.15)', 'rgba(0,0,0,0)']} style={styles.sheetHeaderGrad}>
          <View style={styles.sheetHeader}>
            {room.photo_url ? (
              <Image source={{ uri: room.photo_url }} style={styles.sheetImage} />
            ) : (
              <View style={[styles.sheetImage, styles.sheetImagePlaceholder]}>
                <Armchair size={40} color="rgba(255,255,255,0.3)" />
              </View>
            )}
            <Text style={styles.sheetName}>{room.name}</Text>
            <View style={styles.sheetMetaRow}>
              <View style={[styles.sheetMetaItem, { flex: 1, flexShrink: 1 }]}>
                <MapPin size={13} color="#708F96" />
                <Text style={[styles.sheetMetaText, { flexShrink: 1 }]} numberOfLines={2}>{room.location || 'Main Building'}</Text>
              </View>
              <View style={[styles.sheetMetaItem, { flexShrink: 0 }]}>
                <Users size={13} color="#708F96" />
                <Text style={[styles.sheetMetaText, { flexShrink: 0 }]}>{room.capacity} people</Text>
              </View>
              {room.size ? (
                <View style={[styles.sheetMetaItem, { flexShrink: 0 }]}>
                  <Armchair size={13} color="#708F96" />
                  <Text style={[styles.sheetMetaText, { flexShrink: 0 }]}>{room.size} sqft</Text>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        {/* Amenities */}
        {room.amenities && room.amenities.length > 0 && (
          <View style={styles.sheetSection}>
            <Text style={styles.sectionTitle}>Amenities</Text>
            <View style={styles.amenityGrid}>
              {room.amenities.map((a) => (
                <View key={a} style={styles.amenityGridItem}>
                  <Text style={styles.amenityGridEmoji}>{getAmenityIcon(a)}</Text>
                  <Text style={styles.amenityGridText}>{formatAmenityLabel(a)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Date Picker */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionTitle}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
            {dateOptions.map((date) => {
              const isSelected = isSameDay(date, selectedDate);
              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[styles.dateChip, isSelected && styles.dateChipActive]}
                  onPress={() => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateDay, isSelected && styles.dateTextActive]}>
                    {format(date, 'EEE')}
                  </Text>
                  <Text style={[styles.dateNum, isSelected && styles.dateTextActive]}>
                    {format(date, 'd')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Time Slots */}
        <View style={styles.sheetSection}>
          <Text style={styles.sectionTitle}>Available Slots</Text>
          <View style={styles.slotGrid}>
            {TIME_SLOTS.map((slot) => {
              const booked = isSlotBooked(room.id, selectedDate, slot.start, slot.end, bookings);
              const isSelected = selectedSlot?.start === slot.start;
              return (
                <TouchableOpacity
                  key={slot.start}
                  style={[
                    styles.slotChip,
                    booked && styles.slotChipBooked,
                    isSelected && styles.slotChipSelected,
                  ]}
                  onPress={() => {
                    if (booked) return;
                    setSelectedSlot(slot);
                    Alert.alert(
                      'Confirm Booking',
                      `Do you want to book ${room.name} for ${slot.label}?`,
                      [
                        { text: 'Cancel', style: 'cancel', onPress: () => setSelectedSlot(null) },
                        { text: 'Book', onPress: () => handleBook(slot) }
                      ]
                    );
                  }}
                  activeOpacity={booked ? 1 : 0.7}
                  disabled={booked}
                >
                  <Clock size={12} color={booked ? '#64748B' : isSelected ? '#FFFFFF' : '#94A3B8'} />
                  <Text
                    style={[
                      styles.slotText,
                      booked && styles.slotTextBooked,
                      isSelected && styles.slotTextSelected,
                    ]}
                  >
                    {slot.label}
                  </Text>
                  {booked && <Text style={styles.slotBookedLabel}>Booked</Text>}
                  {isSelected && <CheckCircle2 size={14} color="#10B981" style={{ marginLeft: 4 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Credit Info */}
        {!isAdmin && credit && (
          <View style={styles.creditInfoBox}>
            <CreditCard size={16} color="#FF9F0A" />
            <Text style={styles.creditInfoText}>
              You have <Text style={styles.creditHighlight}>{credit.remaining_hours}h</Text> remaining this month
            </Text>
          </View>
        )}

        {/* Admin Actions */}
        {isAdmin && (
          <View style={styles.adminActionsRow}>
            <TouchableOpacity style={styles.adminActionBtn} onPress={onEdit} activeOpacity={0.8}>
              <Text style={styles.adminActionText}>Edit Room</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.adminActionBtn, styles.adminActionBtnDanger]} onPress={onDelete} activeOpacity={0.8}>
              <Text style={[styles.adminActionText, styles.adminActionTextDanger]}>Deactivate</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Book Button */}
        {!isAdmin && (
          <TouchableOpacity
            style={[styles.bookButton, (!selectedSlot || bookingLoading) && styles.bookButtonDisabled]}
            onPress={() => handleBook(selectedSlot!)}
            disabled={!selectedSlot || bookingLoading}
            activeOpacity={0.8}
          >
            {bookingLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.bookButtonText}>
                {selectedSlot ? `Book for ${selectedSlot.label}` : 'Select a time slot'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RoomsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const { membership, user } = useAuth();

  const { rooms, bookings, credit, hasLoadedInitialData, setRooms, setBookings, setCredit, setHasLoadedInitialData } = useMeetingRoomStore();
  const [loading, setLoading] = useState(!hasLoadedInitialData);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [activeTab, setActiveTab] = useState<'rooms' | 'bookings'>('rooms');
  const [toastConfig, setToastConfig] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const roomSheetRef = useRef<BottomSheetModal>(null);

  // Role detection
  useEffect(() => {
    if (!membership || !propertyId) return;
    const role = membership.properties?.find((p: any) => p.id === propertyId)?.role;
    setIsAdmin(role === 'property_admin' || role === 'staff' || role === 'org_super_admin');
  }, [membership, propertyId]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    if (!hasLoadedInitialData) setLoading(true);
    try {
      const [roomsRes, bookingsRes, creditsRes] = await Promise.all([
        getMeetingRooms(propertyId),
        getMeetingRoomBookings(propertyId, 'confirmed'),
        isAdmin ? Promise.resolve({ credit: null }) : getMeetingRoomCredits(propertyId),
      ]);

      if (roomsRes.rooms) setRooms(roomsRes.rooms);
      if (bookingsRes.bookings) setBookings(bookingsRes.bookings);
      if (!isAdmin && creditsRes.credit !== undefined) {
        setCredit(creditsRes.credit);
      }
      setHasLoadedInitialData(true);
    } catch (e) {
      console.error('[Rooms] fetch error:', e);
      Alert.alert('Error', 'Failed to load meeting rooms.');
    } finally {
      setLoading(false);
    }
  }, [propertyId, isAdmin, hasLoadedInitialData, setRooms, setBookings, setCredit, setHasLoadedInitialData]);

  const { refetch } = useDashboardFetch(queryKeys.property.rooms(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  function handleRoomPress(room: MeetingRoom) {
    setSelectedRoom(room);
    roomSheetRef.current?.present();
  }

  async function handleCancelBooking(bookingId: string) {
    try {
      const res = await cancelMeetingRoomBookingApi(bookingId);
      if (res.error) throw new Error(res.error);
      // Refresh data immediately after success
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not cancel booking.');
    }
  }

  return (
    <View style={styles.container}>
      {/* Background */}
      <LinearGradient
        colors={theme === 'dark' ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Meeting Rooms</Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'rooms' ? `${rooms.length} room${rooms.length !== 1 ? 's' : ''} available` : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          {isAdmin ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.adminBtn} activeOpacity={0.7} onPress={() => router.push(`/property/${propertyId}/rooms/add-room`)}>
                <Plus size={20} color="#708F96" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.adminBtn} activeOpacity={0.7} onPress={() => router.push(`/property/${propertyId}/rooms/admin-credits`)}>
                <Settings2 size={20} color="#708F96" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </SafeBlurView>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rooms' && styles.tabActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.tabTextActive]}>Rooms</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookings' && styles.tabActive]}
          onPress={() => setActiveTab('bookings')}
        >
          <Text style={[styles.tabText, activeTab === 'bookings' && styles.tabTextActive]}>
            {isAdmin ? 'All Bookings' : 'My Bookings'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Credit Banner (non-admin) */}
      {!isAdmin && credit && (
        <View style={styles.creditBanner}>
          <SafeBlurView intensity={60} tint="dark" style={styles.creditBannerInner}>
            <LinearGradient
              colors={['rgba(255,159,10,0.12)', 'rgba(255,159,10,0.04)']}
              style={StyleSheet.absoluteFillObject}
            />
            <CreditCard size={18} color="#FF9F0A" />
            <Text style={styles.creditBannerText}>
              Monthly Credits: <Text style={styles.creditBannerHighlight}>{credit.remaining_hours}h</Text> remaining
            </Text>
          </SafeBlurView>
        </View>
      )}

      {/* Content List */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#708F96" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : activeTab === 'rooms' ? (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RoomCard room={item} onPress={() => handleRoomPress(item)} />}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 12) + 160 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <SafeBlurView intensity={40} tint="dark" style={styles.emptyIconWrap}>
                <Armchair size={32} color="#708F96" />
              </SafeBlurView>
              <Text style={styles.emptyTitle}>No meeting rooms</Text>
              <Text style={styles.emptySubtitle}>No meeting rooms are set up for this property yet.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 12) + 160 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <SafeBlurView intensity={40} style={styles.bookingCard} tint="dark">
              <LinearGradient
                colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.cardContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{item.meeting_room?.name || 'Room'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <CalendarDays size={12} color="#708F96" />
                      <Text style={styles.cardMetaText}>{item.booking_date} · {item.start_time} - {item.end_time}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Users size={12} color="#708F96" />
                      <Text style={styles.cardMetaText}>{item.tenant?.full_name || 'Tenant'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.amenityChip, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.3)', margin: 0 }]}>
                      <Text style={[styles.amenityText, { color: '#10B981' }]}>{item.status || 'Confirmed'}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
                      onPress={() => handleCancelBooking(item.id)}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </SafeBlurView>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <SafeBlurView intensity={40} tint="dark" style={styles.emptyIconWrap}>
                <CalendarDays size={32} color="#708F96" />
              </SafeBlurView>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
            </View>
          }
        />
      )}

      {/* Room Detail Sheet */}
      <RoomDetailSheet
        room={selectedRoom}
        bookings={bookings}
        credit={credit}
        isAdmin={isAdmin}
        bottomSheetRef={roomSheetRef}
        onBook={(success, msg) => {
          fetchData();
          if (msg) {
            setToastConfig({ message: msg, type: success ? 'success' : 'error' });
          }
        }}
        onEdit={() => {
          roomSheetRef.current?.dismiss();
          if (selectedRoom) {
            router.push(`/property/${propertyId}/rooms/${selectedRoom.id}/edit`);
          }
        }}
        onDelete={() => {
          if (!selectedRoom) return;
          Alert.alert(
            'Deactivate Room',
            `Are you sure you want to deactivate "${selectedRoom.name}"?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Deactivate',
                style: 'destructive',
                onPress: async () => {
                  try {
                    const res = await deleteMeetingRoomApi(selectedRoom.id);
                    if (res.error) throw new Error(res.error);
                    roomSheetRef.current?.dismiss();
                    fetchData();
                    Alert.alert('Success', 'Room deactivated successfully.');
                  } catch (err: any) {
                    Alert.alert('Error', err.message || 'Failed to deactivate room.');
                  }
                },
              },
            ]
          );
        }}
      />

      {toastConfig && (
        <Toast
          visible={true}
          message={toastConfig.message}
          type={toastConfig.type}
          onClose={() => setToastConfig(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
    marginTop: 1,
    textAlign: 'center',
  },
  adminBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  adminActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  adminActionBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  adminActionText: {
    fontSize: 14,
    fontFamily: 'Urbanist-SemiBold',
    color: '#FFFFFF',
  },
  adminActionTextDanger: {
    color: '#EF4444',
  },
  creditBanner: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  creditBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.25)',
    overflow: 'hidden',
  },
  creditBannerText: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    color: '#E2E8F0',
  },
  creditBannerHighlight: {
    color: '#FF9F0A',
    fontFamily: 'Poppins-Bold',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
    marginTop: 16,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
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
    fontFamily: 'Urbanist-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cardWrapper: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bookingCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
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
  cardContent: {
    padding: 14,
  },
  cardName: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardMetaText: {
    fontSize: 12,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
  },
  amenityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    fontSize: 10,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Urbanist-Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Bottom Sheet Styles
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  sheetHeaderGrad: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 8,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  sheetImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(112,143,150,0.4)',
  },
  sheetImagePlaceholder: {
    backgroundColor: 'rgba(112,143,150,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetName: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sheetMetaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  sheetMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sheetMetaText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
  },
  sheetSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  amenityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  amenityGridEmoji: {
    fontSize: 14,
  },
  amenityGridText: {
    fontSize: 12,
    fontFamily: 'Urbanist-SemiBold',
    color: '#CBD5E1',
  },
  dateScroll: {
    gap: 8,
    paddingRight: 16,
  },
  dateChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 68,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dateChipActive: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
  },
  dateDay: {
    fontSize: 11,
    fontFamily: 'Urbanist-Medium',
    color: '#94A3B8',
    marginBottom: 4,
  },
  dateNum: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
  dateTextActive: {
    color: '#FFFFFF',
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 100,
  },
  slotChipBooked: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.25)',
    opacity: 0.7,
  },
  slotChipSelected: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  slotText: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    color: '#CBD5E1',
  },
  slotTextBooked: {
    color: '#64748B',
  },
  slotTextSelected: {
    color: '#FFFFFF',
  },
  slotBookedLabel: {
    fontSize: 9,
    fontFamily: 'Urbanist-Bold',
    color: '#EF4444',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  creditInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,159,10,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  creditInfoText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Medium',
    color: '#E2E8F0',
  },
  creditHighlight: {
    fontFamily: 'Poppins-Bold',
    color: '#FF9F0A',
  },
  bookButton: {
    backgroundColor: '#708F96',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bookButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
});
