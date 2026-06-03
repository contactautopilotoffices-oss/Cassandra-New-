
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { Colors } from '@/constants/Colors';
import { useDashboardStore } from '@/stores/dashboardStore';
import { AutopilotLogo } from '@/components/ui/AutopilotLogo';

interface PropertyItem {
  id: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  property_admin: 'Property Admin',
  tenant: 'Tenant',
  security: 'Security',
  staff: 'Staff',
  mst: 'MST',
  vendor: 'Vendor',
};

const ROLE_ICONS: Record<string, string> = {
  property_admin: 'business',
  tenant: 'home',
  security: 'shield-checkmark',
  staff: 'people',
  mst: 'construct',
  vendor: 'briefcase',
};

export default function PropertySelectionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();
  const params = useLocalSearchParams<{ properties?: string }>();
  const { signOut } = useAuth();
  const supabase = createClient();

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [propertyNames, setPropertyNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Parse properties from route params
  useEffect(() => {
    if (params.properties) {
        try {
          const parsed: PropertyItem[] = JSON.parse(params.properties);
          setProperties(parsed);
          if (parsed.length === 1) {
            setSelectedId(parsed[0].id);
            // Clear any cached dashboard data for the previous property
            const { clearCache } = useDashboardStore.getState();
            clearCache();
            router.push(`/property/${parsed[0].id}`);
          } else if (parsed.length > 0) {
            setSelectedId(parsed[0].id);
          }
        } catch {
          console.error('Failed to parse properties from route params');
        }
    }
  }, [params.properties]);

  // Fetch property names for display
  useEffect(() => {
    if (properties.length === 0) return;

    const fetchNames = async () => {
      const ids = properties.map((p) => p.id);
      const { data } = await supabase
        .from('properties')
        .select('id, name')
        .in('id', ids);

      if (data) {
        const nameMap: Record<string, string> = {};
        data.forEach((p: { id: string; name: string }) => {
          nameMap[p.id] = p.name;
        });
        setPropertyNames(nameMap);
      }
    };

    fetchNames();
}, [properties]);

  // Auto-redirect removed to allow explicit selection by the user
  // useEffect(() => {
  //   if (properties.length > 0) {
  //     const firstId = properties[0].id;
  //     router.replace(`/property/${firstId}`);
  //   }
  // }, [properties]);

  const handleContinue = async () => {
    if (!selectedId) return;
    setLoading(true);

    try {
      const prop = properties.find((p) => p.id === selectedId);
      if (!prop) return;

      // Clear any cached dashboard data for the previous property
      const { clearCache } = useDashboardStore.getState();
      clearCache();

      // Redirect to property root — role-based dashboard selection happens there
      router.push(`/property/${selectedId}`);
    } catch (err) {
      console.error('Property selection error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.logoContainer}>
            <AutopilotLogo width={160} height={40} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            Select a Property
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            You have access to {properties.length}{' '}
            {properties.length === 1 ? 'property' : 'properties'}.
            Choose one to continue.
          </Text>

          {/* Property List */}
          <View style={styles.listContainer}>
            {properties.map((prop) => {
              const isSelected = selectedId === prop.id;
              const iconName = ROLE_ICONS[prop.role] || 'business';
              const roleLabel = ROLE_LABELS[prop.role] || prop.role;

              return (
                <TouchableOpacity
                  key={prop.id}
                  style={[
                    styles.propertyCard,
                    {
                      borderColor: isSelected ? theme.primary : theme.border,
                      backgroundColor: isSelected ? `${theme.primary}15` : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedId(prop.id)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.propertyIcon,
                    { backgroundColor: isSelected ? theme.primary : theme.surface },
                  ]}>
                    <Ionicons
                      name={iconName as any}
                      size={22}
                      color={isSelected ? '#FFFFFF' : theme.textSecondary}
                    />
                  </View>
                  <View style={styles.propertyInfo}>
                    <Text style={[styles.propertyName, { color: theme.text }]}>
                      {propertyNames[prop.id] || 'Loading...'}
                    </Text>
                    <Text style={[styles.propertyRole, { color: theme.textSecondary }]}>
                      {roleLabel}
                    </Text>
                  </View>
                  <View style={[
                    styles.radioOuter,
                    { borderColor: isSelected ? theme.primary : theme.border },
                  ]}>
                    {isSelected && (
                      <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              {
                backgroundColor: theme.primary,
                opacity: !selectedId || loading ? 0.6 : 1,
              },
            ]}
            onPress={handleContinue}
            disabled={!selectedId || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.continueRow}>
                <Text style={styles.continueText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color={theme.textSecondary} />
            <Text style={[styles.signOutText, { color: theme.textSecondary }]}>
              Sign out and use a different account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 24,
    padding: 28,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
  },
  logoContainer: { alignItems: 'center', marginBottom: 16 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: 'Urbanist-Bold',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: 'Urbanist-Regular',
  },
  listContainer: {
    gap: 12,
    marginBottom: 20,
  },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  propertyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  propertyInfo: { flex: 1 },
  propertyName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: 'Urbanist-Bold',
  },
  propertyRole: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  continueButton: {
    borderRadius: 10,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  continueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  continueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Urbanist-Bold',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  signOutText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
  },
});
