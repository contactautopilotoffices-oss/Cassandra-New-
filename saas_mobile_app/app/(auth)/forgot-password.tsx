
import React, { useState } from 'react';
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
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/Colors';
import { AutopilotLogo } from '@/components/ui/AutopilotLogo';

// ─── Zod schema ───────────────────────────────────────────────────────────────
const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ForgotPasswordScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const router = useRouter();
  const { resetPassword } = useAuth();

  const [showSuccess, setShowSuccess] = useState(false);
  const [apiError, setApiError] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  const onSubmit = async (values: ForgotForm) => {
    setApiError('');
    try {
      await resetPassword(values.email);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 10000);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('too many')) {
        setApiError('Too many requests. Please wait a few minutes before trying again.');
      } else if (msg.includes('not found') || msg.includes('not exist')) {
        // Don't reveal whether email exists for security
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 10000);
      } else {
        setApiError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Success Banner */}
        {showSuccess && (
          <View style={[styles.successBanner, {
            backgroundColor: theme.successBg,
            borderColor: theme.successBorder,
          }]}>
            <View style={[styles.successIconCircle, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
              <Ionicons name="checkmark-circle" size={24} color={theme.success} />
            </View>
            <View style={styles.successContent}>
              <Text style={[styles.successTitle, { color: theme.text }]}>Reset Link Sent!</Text>
              <Text style={[styles.successMessage, { color: theme.textSecondary }]}>
                A password reset link has been sent to{' '}
                <Text style={{ fontWeight: '700', color: theme.text }}>{getValues('email')}</Text>.
                Check your inbox and spam folder.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowSuccess(false)}>
              <Ionicons name="close" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.card, {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: colorScheme === 'dark' ? '#000' : theme.shadowColor,
        }]}>
          {/* Icon */}
          <View style={[styles.iconCircle, {
            backgroundColor: theme.primaryLight,
            borderColor: theme.primary,
          }]}>
            <Ionicons name="key-outline" size={28} color={theme.primary} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Forgot Password?</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            No worries! Enter your email and we'll send you a reset link.
          </Text>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Email Address</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder="name@company.com"
                        placeholderTextColor={theme.textTertiary}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                      />
                    </View>
                    {error && <Text style={[styles.fieldError, { color: theme.error }]}>{error.message}</Text>}
                  </>
                )}
              />
            </View>

            {/* API Error */}
            {apiError !== '' && (
              <View style={[styles.messageBox, { backgroundColor: theme.errorBg, borderColor: theme.errorBorder }]}>
                <Ionicons name="alert-circle" size={16} color={theme.error} style={{ marginRight: 8 }} />
                <Text style={[styles.messageText, { color: theme.error }]}>{apiError}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, {
                backgroundColor: theme.primary,
                opacity: isSubmitting ? 0.6 : 1,
              }]}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.submitRow}>
                  <Text style={styles.submitText}>Send Reset Link</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* Back to Sign In */}
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={16} color={theme.primary} />
              <Text style={[styles.backText, { color: theme.primary }]}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  successIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  successContent: { flex: 1 },
  successTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: 'Urbanist-Bold',
  },
  successMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Urbanist-Regular',
  },
  card: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
  },
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
  form: { width: '100%' },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    fontFamily: 'Urbanist-SemiBold',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    fontFamily: 'Urbanist-Regular',
  },
  fieldError: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    fontFamily: 'Urbanist-Regular',
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    fontFamily: 'Urbanist-SemiBold',
  },
  submitButton: {
    borderRadius: 10,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Urbanist-Bold',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
  },
});
