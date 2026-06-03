'use client';

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context';

export default function VendorDashboard({ propertyId }: { propertyId: string }) {
  const { user, signOut } = useAuth();
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Vendor Dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Property: {propertyId}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="construct-outline" size={48} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Maintenance Vendor</Text>
          <Text style={[styles.cardText, { color: colors.textSecondary }]}>
            Welcome, {user?.user_metadata?.full_name || user?.email || 'Vendor'}.
            Your dashboard is currently under construction.
          </Text>
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.signOutBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' }]} 
        onPress={signOut}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    gap: 8,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
