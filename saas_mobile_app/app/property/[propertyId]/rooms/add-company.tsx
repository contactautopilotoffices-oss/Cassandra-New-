import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import SafeBlurView from '@/components/ui/SafeBlurView';
import { createCompanyApi } from '@/utils/api/mobileApi';
import { useAuth } from '@/hooks/useAuth';

export default function AddCompanyScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { membership } = useAuth();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateCompany = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Company name is required.');
      return;
    }

    const orgId = membership?.org_id || process.env.EXPO_PUBLIC_AUTOPILOT_ORG_ID;
    if (!orgId) {
      Alert.alert('Error', 'Organization ID not found.');
      return;
    }

    setLoading(true);
    try {
      const res = await createCompanyApi({
        name: name.trim(),
        property_id: propertyId as string,
        organization_id: orgId as string,
      });

      if (res.error) {
        throw new Error(res.error);
      }

      Alert.alert('Success', 'Company created successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create company.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme === 'dark' ? ['#0F1521', '#121824', '#090d16'] : ['#F5F0E8', '#EAE0D5', '#DFD3C3']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeBlurView intensity={80} tint="dark" style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Add Company</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeBlurView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SafeBlurView intensity={40} tint="dark" style={styles.formCard}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
            style={StyleSheet.absoluteFillObject}
          />
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>Company Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Acme Corp"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleCreateCompany}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Create Company</Text>
            )}
          </TouchableOpacity>
        </SafeBlurView>
      </ScrollView>
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
});
