
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
const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignUpForm = z.infer<typeof signUpSchema>;

// ─── Component ────────────────────────────────────────────────────────────────
export default function SignupScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const router = useRouter();
  const { signUp } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onSubmit',
  });

  const onSubmit = async (values: SignUpForm) => {
    setApiError('');
    setApiSuccess('');
    try {
      const result = await signUp(values.email, values.password, values.fullName);
      if (result?.session) {
        router.replace('/onboarding' as any);
      } else if (result?.user) {
        setApiSuccess('Account created! Please check your email inbox to verify your account before logging in.');
        reset();
      } else {
        throw new Error('Signup failed to return user data.');
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setApiError('An account with this email already exists. Try signing in instead.');
      } else if (msg.includes('too many requests')) {
        setApiError('Too many signup attempts. Please wait a few minutes before trying again.');
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
        <View style={[styles.card, {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: colorScheme === 'dark' ? '#000' : theme.shadowColor,
        }]}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <AutopilotLogo size={48} variant={colorScheme === 'dark' ? 'light' : 'dark'} />
          </View>

          {/* Heading */}
          <Text style={[styles.title, { color: theme.text }]}>Join Autopilot</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Create your account and start managing your facilities
          </Text>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Full Name</Text>
              <Controller
                control={control}
                name="fullName"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="person-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder="John Doe"
                        placeholderTextColor={theme.textTertiary}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        autoCapitalize="words"
                        autoComplete="name"
                      />
                    </View>
                    {error && <Text style={[styles.fieldError, { color: theme.error }]}>{error.message}</Text>}
                  </>
                )}
              />
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Email</Text>
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

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Password</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder="Min. 6 characters"
                        placeholderTextColor={theme.textTertiary}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        secureTextEntry={!showPassword}
                        autoComplete="password-new"
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={theme.textTertiary}
                        />
                      </TouchableOpacity>
                    </View>
                    {error && <Text style={[styles.fieldError, { color: theme.error }]}>{error.message}</Text>}
                  </>
                )}
              />
            </View>

            {/* Confirm Password */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Confirm Password</Text>
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        placeholder="Re-enter your password"
                        placeholderTextColor={theme.textTertiary}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="password-new"
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={theme.textTertiary}
                        />
                      </TouchableOpacity>
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

            {/* API Success */}
            {apiSuccess !== '' && (
              <View style={[styles.messageBox, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                <Ionicons name="checkmark-circle" size={16} color={theme.success} style={{ marginRight: 8 }} />
                <Text style={[styles.messageText, { color: theme.success }]}>{apiSuccess}</Text>
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
                  <Text style={styles.submitText}>Create Account</Text>
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
  card: {
    borderRadius: 24,
    padding: 28,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
  },
  logoContainer: { alignItems: 'center', marginBottom: 20 },
  title: {
    fontSize: 26,
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
  form: {},
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
  eyeButton: { padding: 4 },
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
    marginTop: 4,
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
