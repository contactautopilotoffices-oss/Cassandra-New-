import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';

interface LoggersMenuProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
}

export function LoggersMenu({ visible, onClose, propertyId }: LoggersMenuProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = Colors[theme];

  const menuItems = [
    {
      title: 'Electricity Logger',
      icon: 'flash' as const,
      bgColor: 'rgba(245,158,11,0.1)',
      iconColor: '#F59E0B',
      description: 'Log power consumption & meter readings',
      route: `/property/${propertyId}/electricity`,
    },
    {
      title: 'Diesel Logger',
      icon: 'water' as const,
      bgColor: 'rgba(59,130,246,0.1)',
      iconColor: '#3B82F6',
      description: 'Log fuel refills & generator levels',
      route: `/property/${propertyId}/diesel`,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.menuContainer,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 40,
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Utility Loggers</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Items */}
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.menuItem,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => {
                onClose();
                router.push(item.route as any);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.bgColor }]}>
                <Ionicons name={item.icon} size={20} color={item.iconColor} />
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    padding: 20,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
