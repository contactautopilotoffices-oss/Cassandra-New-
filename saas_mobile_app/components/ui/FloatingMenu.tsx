import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');

export interface MenuItem {
  label: string;
  icon: string;
  onPress: () => void;
}

export interface FloatingMenuProps {
  items: MenuItem[];
  footer?: { label: string; icon: string; onPress: () => void; danger?: boolean };
  title?: string;
}

export default function FloatingMenu({ items, footer, title }: FloatingMenuProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* Floating hamburger button */}
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + 12 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <View style={styles.fabInner}>
          <Ionicons name="menu" size={22} color="rgba(255,255,255,0.85)" />
        </View>
      </TouchableOpacity>

      {/* Drawer overlay */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.drawer, { paddingTop: insets.top + 16 }]} onStartShouldSetResponder={() => true}>
            {title && (
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>{title}</Text>
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.item}
                  onPress={() => { setOpen(false); item.onPress(); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.60)" />
                  <Text style={styles.itemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {footer && (
              <TouchableOpacity
                style={styles.footer}
                onPress={() => { setOpen(false); footer.onPress(); }}
                activeOpacity={0.7}
              >
                <Ionicons name={footer.icon as any} size={20} color={footer.danger ? '#FF3B30' : 'rgba(255,255,255,0.60)'} />
                <Text style={[styles.footerText, footer.danger && { color: '#FF3B30' }]}>{footer.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const DRAWER_W = 260;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 16,
    zIndex: 50,
  },
  fabInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
  },
  drawer: {
    width: DRAWER_W,
    height: '100%',
    backgroundColor: 'rgba(12,14,22,0.98)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  drawerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  itemText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 14,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginTop: 'auto',
  },
  footerText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 14,
  },
});
