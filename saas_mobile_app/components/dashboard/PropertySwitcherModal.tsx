import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentPropertyId: string;
  orgId: string;
}

export default function PropertySwitcherModal({
  visible,
  onClose,
  currentPropertyId,
  orgId,
}: Props) {
  const router = useRouter();
  const { membership } = useAuth();

  // Get properties from membership and sort by code
  const properties = React.useMemo(() => {
    if (!membership?.properties) return [];
    return [...membership.properties].sort((a, b) => {
      const codeA = (a.code || '').toUpperCase();
      const codeB = (b.code || '').toUpperCase();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [membership]);

  // Only show "All Properties" for org admins or property admins with multiple properties
  const canViewAllProperties = React.useMemo(() => {
    if (!membership) return false;
    const orgRole = (membership.org_role || '').toLowerCase();
    if (['org_super_admin', 'org_admin', 'owner'].includes(orgRole)) return true;
    const hasAdminRole = membership.properties?.some(p =>
      ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'].includes((p.role || '').toLowerCase())
    );
    return hasAdminRole && (membership.properties?.length ?? 0) > 1;
  }, [membership]);

  const handleSelectProperty = (id: string) => {
    onClose();
    if (id === currentPropertyId) return;
    router.replace(`/property/${id}/dashboard` as never);
  };

  const handleSelectAll = () => {
    onClose();
    if ('all' === currentPropertyId) return;
    router.replace(`/property/all/dashboard` as never);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Switch Property</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* All Properties Option — only for admins */}
            {canViewAllProperties && (
              <>
                <TouchableOpacity
                  style={styles.item}
                  onPress={handleSelectAll}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconContainer}>
                    <Ionicons name="grid-outline" size={20} color="#3B82F6" />
                  </View>
                  <View style={styles.itemTextContainer}>
                    <Text style={styles.itemName}>All Properties (Overview)</Text>
                    <Text style={styles.itemSubtext}>Aggregated organization data</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>

                <View style={styles.divider} />
              </>
            )}

            {/* Individual Properties */}
            {properties.map((p) => {
              const isActive = p.id === currentPropertyId;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.item, isActive && styles.itemActive]}
                  onPress={() => handleSelectProperty(p.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, isActive && styles.iconContainerActive, p.image_url ? { padding: 0, overflow: 'hidden', borderWidth: 0 } : {}]}>
                    {p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                    ) : (
                      <Ionicons
                        name="business-outline"
                        size={20}
                        color={isActive ? '#000' : 'rgba(255,255,255,0.6)'}
                      />
                    )}
                  </View>
                  <View style={styles.itemTextContainer}>
                    <Text style={[styles.itemName, isActive && styles.itemNameActive]}>
                      {p.name}
                    </Text>
                    <Text style={[styles.itemSubtext, isActive && styles.itemSubtextActive]}>
                      {p.code || 'NO-CODE'}
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <SafeAreaView edges={['bottom']} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdrop: {
    flex: 1,
  },
  content: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '50%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  iconContainerActive: {
    backgroundColor: '#FFF',
  },
  itemTextContainer: {
    flex: 1,
  },
  itemName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemNameActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  itemSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  itemSubtextActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 12,
    marginHorizontal: 16,
  },
});
