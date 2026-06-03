/**
 * FullScreenModal — Shared glass header with close button
 *
 * All Cassandra modals (Dashboard, Chat, Users, Files) use this shell.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography } from '@/constants/cassandra-theme';
import Svg, { Path } from 'react-native-svg';

interface FullScreenModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const CloseIcon = ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  visible,
  title,
  onClose,
  children,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Glass Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
            <CloseIcon />
          </TouchableOpacity>
        </View>

        {/* Drag handle (visual only) */}
        <View style={styles.dragHandle} />

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginTop: 8,
    marginBottom: 4,
  },
  scroll: {
    flex: 1,
  },
});

export default FullScreenModal;
