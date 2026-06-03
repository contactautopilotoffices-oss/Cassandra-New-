import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronLeft,
  Upload,
  Check,
  Loader2,
  X,
  Camera,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  createMeetingRoomApi,
  updateMeetingRoomApi,
  uploadMeetingRoomPhoto,
  getMeetingRooms,
} from '@/services/meetingRoomService';

const CAPACITY_OPTIONS = [2, 4, 6, 8, 10, 12, 15, 20];

const AMENITY_OPTIONS = [
  'TV Screen',
  'Whiteboard',
  'Projector',
  'Video Conf',
  'Coffee Maker',
  'AC',
  'Fast WiFi',
];

export default function AddRoomScreen() {
  const { propertyId, roomId } = useLocalSearchParams<{ propertyId: string; roomId?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isEdit = Boolean(roomId);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState<number | null>(null);
  const [size, setSize] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [isFetching, setIsFetching] = useState(isEdit);

  // Fetch room data for edit mode
  useEffect(() => {
    if (!isEdit || !roomId) return;
    const fetchRoom = async () => {
      try {
        const res = await getMeetingRooms(propertyId);
        const room = res.rooms?.find((r) => r.id === roomId);
        if (room) {
          setName(room.name);
          setLocation(room.location || '');
          setCapacity(room.capacity);
          setSize(room.size ? String(room.size) : '');
          setPhotoUrl(room.photo_url || '');
          setAmenities(room.amenities || []);
          setStatus(room.status === 'inactive' ? 'inactive' : 'active');
        }
      } catch (err) {
        console.error('Error fetching room:', err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchRoom();
  }, [isEdit, roomId, propertyId]);

  const toggleAmenity = (amenity: string) => {
    setAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const handlePickImage = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission Required', `Please allow ${source === 'camera' ? 'camera' : 'photo library'} access.`);
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
          });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setIsUploading(true);
      try {
        const uploadRes = await uploadMeetingRoomPhoto(uri);
        if (uploadRes.success && uploadRes.url) {
          setPhotoUrl(uploadRes.url);
        } else {
          Alert.alert('Upload Failed', uploadRes.error || 'Could not upload photo.');
        }
      } catch (err: any) {
        Alert.alert('Upload Error', err.message || 'Failed to upload photo.');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const showImageSourceOptions = () => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => handlePickImage('camera') },
      { text: 'Photo Library', onPress: () => handlePickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const validate = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Room name is required.');
      return false;
    }
    if (!location.trim()) {
      Alert.alert('Validation Error', 'Location is required.');
      return false;
    }
    if (!capacity || capacity <= 0) {
      Alert.alert('Validation Error', 'Please select a capacity.');
      return false;
    }
    if (!photoUrl && !isEdit) {
      Alert.alert('Validation Error', 'Please upload a room photo.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        propertyId: propertyId as string,
        location: location.trim(),
        capacity: capacity!,
        size: size ? parseInt(size, 10) : undefined,
        photo_url: photoUrl || undefined,
        amenities,
        status,
      };

      const res = isEdit
        ? await updateMeetingRoomApi(roomId!, payload)
        : await createMeetingRoomApi(payload);

      if (res.error) {
        throw new Error(res.error);
      }

      Alert.alert(
        'Success',
        isEdit ? 'Meeting room updated successfully!' : 'Meeting room created successfully!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save room.');
    } finally {
      setLoading(false);
    }
  };

  if (isFetching) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient
          colors={theme === 'dark' ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator color="#708F96" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
            <Text style={styles.headerTitle}>{isEdit ? 'Edit Meeting Room' : 'Add Meeting Room'}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeBlurView>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SafeBlurView intensity={40} tint="dark" style={styles.formCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Photo Upload */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Room Photo {!isEdit && '*'}</Text>
            <TouchableOpacity
              style={styles.photoUploadArea}
              onPress={showImageSourceOptions}
              activeOpacity={0.8}
              disabled={isUploading}
            >
              {photoUrl ? (
                <>
                  <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
                  <View style={styles.photoOverlay}>
                    <TouchableOpacity
                      style={styles.changePhotoBtn}
                      onPress={showImageSourceOptions}
                    >
                      <Upload size={16} color="#FFFFFF" />
                      <Text style={styles.changePhotoText}>Change Photo</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : isUploading ? (
                <View style={styles.photoPlaceholder}>
                  <Loader2 size={28} color="#708F96" />
                  <Text style={styles.photoPlaceholderText}>Uploading...</Text>
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <ImageIcon size={28} color="#64748B" />
                  <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
                  <Text style={styles.photoHint}>Camera or Gallery</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Room Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Room Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Executive Boardroom"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Location */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Location *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 4th Floor, West Wing"
              placeholderTextColor="#64748B"
              value={location}
              onChangeText={setLocation}
            />
          </View>

          {/* Capacity */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Capacity *</Text>
            <TouchableOpacity
              style={styles.selectBox}
              onPress={() => setShowCapacityModal(true)}
              activeOpacity={0.8}
            >
              <Text style={capacity ? styles.selectValue : styles.selectPlaceholder}>
                {capacity ? `${capacity} Seater` : 'Select capacity'}
              </Text>
              <ChevronLeft size={18} color="#64748B" style={{ transform: [{ rotate: '-90deg' }] }} />
            </TouchableOpacity>
          </View>

          {/* Size */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Size (sqft)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 250"
              placeholderTextColor="#64748B"
              keyboardType="number-pad"
              value={size}
              onChangeText={setSize}
            />
          </View>

          {/* Amenities */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Amenities</Text>
            <View style={styles.amenityGrid}>
              {AMENITY_OPTIONS.map((amenity) => {
                const isSelected = amenities.includes(amenity);
                return (
                  <TouchableOpacity
                    key={amenity}
                    style={[
                      styles.amenityChip,
                      isSelected && styles.amenityChipSelected,
                    ]}
                    onPress={() => toggleAmenity(amenity)}
                    activeOpacity={0.7}
                  >
                    {isSelected && <Check size={12} color="#FFFFFF" style={{ marginRight: 4 }} />}
                    <Text
                      style={[
                        styles.amenityText,
                        isSelected && styles.amenityTextSelected,
                      ]}
                    >
                      {amenity}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Status (edit mode only) */}
          {isEdit && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusRow}>
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === 'active' && styles.statusBtnActive,
                  ]}
                  onPress={() => setStatus('active')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[styles.statusText, status === 'active' && styles.statusTextActive]}>
                    Active
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === 'inactive' && styles.statusBtnInactive,
                  ]}
                  onPress={() => setStatus('inactive')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.statusText, status === 'inactive' && styles.statusTextInactive]}>
                    Inactive
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isEdit ? 'Update Room' : 'Create Room'}
              </Text>
            )}
          </TouchableOpacity>
        </SafeBlurView>
      </ScrollView>

      {/* Capacity Modal */}
      <Modal
        visible={showCapacityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCapacityModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCapacityModal(false)}>
          <SafeBlurView intensity={80} tint="dark" style={styles.modalContent}>
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.2)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.modalTitle}>Select Capacity</Text>
            {CAPACITY_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.modalOption,
                  capacity === c && styles.modalOptionSelected,
                ]}
                onPress={() => {
                  setCapacity(c);
                  setShowCapacityModal(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    capacity === c && styles.modalOptionTextSelected,
                  ]}
                >
                  {c} Seater
                </Text>
                {capacity === c && <Check size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowCapacityModal(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </SafeBlurView>
        </Pressable>
      </Modal>
    </View>
  );
}

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
  },
  content: {
    padding: 16,
  },
  formCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Urbanist-Medium',
  },
  photoUploadArea: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backdropFilter: 'blur(10px)',
  },
  changePhotoText: {
    color: '#FFFFFF',
    fontFamily: 'Urbanist-SemiBold',
    fontSize: 14,
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoPlaceholderText: {
    color: '#64748B',
    fontFamily: 'Urbanist-SemiBold',
    fontSize: 14,
  },
  photoHint: {
    color: '#475569',
    fontFamily: 'Urbanist-Medium',
    fontSize: 12,
  },
  selectBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Urbanist-Medium',
  },
  selectPlaceholder: {
    color: '#64748B',
    fontSize: 16,
    fontFamily: 'Urbanist-Medium',
  },
  amenityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  amenityChipSelected: {
    backgroundColor: '#708F96',
    borderColor: '#708F96',
  },
  amenityText: {
    fontSize: 13,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
  },
  amenityTextSelected: {
    color: '#FFFFFF',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusBtnActive: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.4)',
  },
  statusBtnInactive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
  },
  statusTextActive: {
    color: '#22C55E',
  },
  statusTextInactive: {
    color: '#EF4444',
  },
  submitBtn: {
    backgroundColor: '#708F96',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modalOptionSelected: {
    backgroundColor: '#708F96',
  },
  modalOptionText: {
    fontSize: 16,
    fontFamily: 'Urbanist-SemiBold',
    color: '#FFFFFF',
  },
  modalOptionTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Urbanist-Bold',
  },
  modalCloseBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalCloseText: {
    fontSize: 14,
    fontFamily: 'Urbanist-SemiBold',
    color: '#94A3B8',
  },
});
