import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import Loader from '@/components/ui/Loader';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSessionReady(true);
        } else {
          setError('No active reset session. Please request a new password reset link.');
        }
      } catch {
        setError('Something went wrong. Please request a new reset link.');
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, [supabase]);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err: any) {
      if (err.message?.includes('same_password')) {
        setError('New password must differ from your current password.');
      } else {
        setError(err.message || 'Failed to update password.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.loadingContainer}>
        <Loader size="lg" text="Verifying reset link..." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {success ? (
            /* Success state */
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={40} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>Password Updated!</Text>
              <Text style={styles.successSubtitle}>
                Your password has been changed successfully. Please sign in with your new password.
              </Text>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => router.replace('/(auth)/login' as any)}
                activeOpacity={0.8}
              >
                <View style={styles.submitRow}>
                  <Text style={styles.submitText}>Go to Sign In</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form */
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="key-outline" size={28} color="#708F96" />
              </View>
              <Text style={styles.title}>Set New Password</Text>
              <Text style={styles.subtitle}>
                Create a strong password to secure your account
              </Text>

              {/* New Password */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Ionicons name="lock-closed-outline" size={14} color="#94A3B8" />
                  <Text style={styles.label}>New Password</Text>
                </View>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, !sessionReady && { opacity: 0.5 }]}
                    placeholder="Enter new password (min 6 characters)"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={sessionReady}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Ionicons name="lock-closed-outline" size={14} color="#94A3B8" />
                  <Text style={styles.label}>Confirm Password</Text>
                </View>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, !sessionReady && { opacity: 0.5 }]}
                    placeholder="Confirm your new password"
                    placeholderTextColor="#94A3B8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    editable={sessionReady}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
                {confirmPassword !== '' && (
                  <Text style={{ fontSize: 12, fontWeight: '500', color: password === confirmPassword ? '#10B981' : '#EF4444', marginTop: 4 }}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </Text>
                )}
              </View>

              {/* Error */}
              {error !== '' && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {!sessionReady && !error && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    No active session. Please click the reset link from your email.
                  </Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, (loading || !sessionReady) && { opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={loading || !sessionReady}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={styles.submitRow}>
                    <Text style={styles.submitText}>Update Password</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Links */}
              <TouchableOpacity
                style={{ marginTop: 20, alignItems: 'center' }}
                onPress={() => router.push('/(auth)/forgot-password' as any)}
              >
                <Text style={styles.linkText}>Request a new reset link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 8, alignItems: 'center' }}
                onPress={() => router.push('/(auth)/login' as any)}
              >
                <Text style={styles.backLink}>← Back to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16,
    elevation: 4, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(124,58,237,0.08)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1A2332', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  fieldGroup: { width: '100%', marginBottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#1A2332' },
  input: {
    height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingRight: 48,
    fontSize: 14, color: '#1A2332', width: '100%',
  },
  passwordContainer: { position: 'relative' as const },
  eyeButton: { position: 'absolute' as const, right: 12, top: 12 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8, padding: 12, marginBottom: 16, width: '100%',
  },
  errorText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  warningBox: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: 8, padding: 12, marginBottom: 16, width: '100%',
  },
  warningText: { fontSize: 13, fontWeight: '600', color: '#F59E0B' },
  submitButton: {
    backgroundColor: '#F59E0B', borderRadius: 8, height: 48,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#D97706', width: '100%',
  },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  linkText: { fontSize: 14, fontWeight: '600', color: '#708F96' },
  backLink: { fontSize: 12, color: '#94A3B8' },
  successContainer: { alignItems: 'center', paddingVertical: 16 },
  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(16,185,129,0.08)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1A2332', marginBottom: 8 },
  successSubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
});
