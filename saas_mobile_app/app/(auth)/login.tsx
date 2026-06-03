import React, { useState, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';

// ─── Lovable Dashboard Font Stack ────────────────────────────────────────────
const FONT_FAMILY = Platform.select({
  web: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const FONT_TRACKING = {
  display: -0.04 * 16,  // -0.04em
  body: -0.01 * 16,     // -0.01em
  tight: -0.02 * 16,    // -0.02em
};
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { authService } from '@/services/authService';
import { Colors } from '@/constants/Colors';
import { AutopilotLogo } from '@/components/ui/AutopilotLogo';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

// ─── Zod schema ───────────────────────────────────────────────────────────────
const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;

type AuthMode = 'signin' | 'signup';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Floating decorative shape ───────────────────────────────────────────────
function FloatingShape({
  size,
  color,
  top,
  left,
  right,
  delay,
  duration,
}: {
  size: number;
  color: string;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  delay: number;
  duration: number;
}) {
  const floatY = useSharedValue(0);
  const floatX = useSharedValue(0);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 600 });
      floatY.value = withRepeat(
        withSequence(
          withTiming(-12, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(12, { duration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      floatX.value = withRepeat(
        withSequence(
          withTiming(8, { duration: duration * 1.3, easing: Easing.inOut(Easing.ease) }),
          withTiming(-8, { duration: duration * 1.3, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: floatY.value },
      { translateX: floatX.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.floatingShape,
        {
          width: size,
          height: size,
          backgroundColor: color,
          top: top as number | undefined,
          left: left as number | undefined,
          right: right as number | undefined,
          borderRadius: size * 0.35,
        } as any,
        animatedStyle,
      ]}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSuccess, setApiSuccess] = useState('');

  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ─── React Hook Form – Sign In ─────────────────────────────────────────────
  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
  });

  // ─── React Hook Form – Sign Up ──────────────────────────────────────────────
  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onSubmit',
  });

  const isSignInLoading = signInForm.formState.isSubmitting;
  const isSignUpLoading = signUpForm.formState.isSubmitting;

  // ─── Floating shapes config (theme-aware) ────────────────────────────────────
  const shapes = useMemo(
    () => [
      { size: 64, color: isDark ? 'rgba(112,143,150,0.12)' : 'rgba(112,143,150,0.10)', top: 60, left: -20, delay: 0, duration: 3500 },
      { size: 40, color: isDark ? 'rgba(41,151,255,0.10)' : 'rgba(41,151,255,0.08)', top: 140, right: 20, delay: 400, duration: 4000 },
      { size: 28, color: isDark ? 'rgba(112,143,150,0.15)' : 'rgba(112,143,150,0.12)', top: 240, left: 30, delay: 800, duration: 3200 },
      { size: 48, color: isDark ? 'rgba(255,159,10,0.08)' : 'rgba(255,159,10,0.06)', top: 360, right: -10, delay: 200, duration: 3800 },
      { size: 20, color: isDark ? 'rgba(52,199,89,0.10)' : 'rgba(52,199,89,0.08)', top: 480, left: '20%', delay: 600, duration: 3000 },
    ],
    [isDark]
  );

  // ─── Redirect helper ────────────────────────────────────────────────────────
  const resolveAndRedirect = async (authUserId: string) => {
    const { data: { user: authUserData } } = await supabase.auth.getUser();

    if (authUserData?.email?.toLowerCase() === 'sanyog@gmail.com') {
      router.replace('/super-admin' as any);
      return;
    }

    const { data: userProfile, error: profileError } = await (supabase
      .from('users')
      .select('id')
      .eq('id', authUserId)
      .single() as unknown as Promise<{ data: { id: string } | null; error: unknown }>);

    if (profileError || !userProfile) {
      throw new Error('User profile not found.');
    }

    // TODO: is_master_admin does not exist on the users table — use a dedicated master_admins table or role check via memberships
    // if (userProfile.is_master_admin) {
    //   router.replace('/master' as any);
    //   return;
    // }

    const { data: orgMemberships } = await supabase
      .from('organization_memberships')
      .select('organization_id, role, is_active')
      .eq('user_id', userProfile.id) as { data: unknown; error: unknown };

    type OrgMembershipRow = { organization_id: string; role: string; is_active: boolean | null };
    const orgRows = (orgMemberships ?? []) as OrgMembershipRow[];

    const ORG_LEVEL_ROLES = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'org_admin', 'maintenance_vendor'];
    const activeOrgMemberships = orgRows.filter(
      (m) => ORG_LEVEL_ROLES.includes(m.role) && (m.is_active === true || m.is_active === null)
    );

    if (activeOrgMemberships.length > 0) {
      const ORG_PRIORITY = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'member'];
      const best = [...activeOrgMemberships].sort((a, b) => {
        const ai = ORG_PRIORITY.indexOf(a.role) === -1 ? 99 : ORG_PRIORITY.indexOf(a.role);
        const bi = ORG_PRIORITY.indexOf(b.role) === -1 ? 99 : ORG_PRIORITY.indexOf(b.role);
        return ai - bi;
      })[0];

      // Fetch org properties to pass to property selection
      const { data: orgProps } = await supabase
        .from('properties')
        .select('id, name')
        .eq('organization_id', best.organization_id);

      if (orgProps && orgProps.length > 0) {
        if (orgProps.length === 1) {
          router.replace(`/property/${orgProps[0].id}` as any);
        } else {
          const propsParam = encodeURIComponent(JSON.stringify(orgProps.map((p: any) => ({
            id: p.id,
            role: best.role
          }))));
          router.replace(`/(auth)/property-selection?properties=${propsParam}`);
        }
        return;
      } else {
        router.replace('/(auth)/property-selection');
        return;
      }
    }

    const { data: propMemberships } = await supabase
      .from('property_memberships')
      .select('property_id, organization_id, role, is_active')
      .eq('user_id', userProfile.id)
      .order('created_at', { ascending: false }) as { data: unknown; error: unknown };

    type PropMembershipRow = { property_id: string; organization_id: string; role: string; is_active: boolean | null };
    const propRows = (propMemberships ?? []) as PropMembershipRow[];

    const activePropMemberships = propRows.filter(
      (m) => m.is_active === true || m.is_active === null
    );

    if (activePropMemberships.length === 0) {
      router.replace('/onboarding' as any);
      return;
    }

    if (activePropMemberships.length === 1) {
      const { property_id: pId } = activePropMemberships[0];
      // Route through /property/[id] which handles role-based dashboard selection
      router.replace(`/property/${pId}`);
      return;
    }

    router.replace({
      pathname: '/(auth)/property-selection',
      params: {
        properties: JSON.stringify(activePropMemberships.map((m) => ({ id: m.property_id, role: m.role }))),
      },
    });
  };

  // ─── Handle Sign In ─────────────────────────────────────────────────────────
  const handleSignIn = async (values: SignInForm) => {
    setApiError('');
    setApiSuccess('');
    try {
      const { data: { user: authUser }, error: signInError } = await signIn(values.email, values.password);
      if (signInError || !authUser) throw new Error(signInError || 'Login failed');

      await resolveAndRedirect(authUser.id);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setApiError('Invalid email or password. Please check your credentials and try again.');
      } else if (msg.includes('email not confirmed')) {
        setApiError('Please verify your email address before signing in. Check your inbox for a verification link.');
      } else if (msg.includes('too many requests')) {
        setApiError('Too many login attempts. Please wait a few minutes before trying again.');
      } else if (msg.includes('network')) {
        setApiError('Network error. Please check your internet connection and try again.');
      } else {
        setApiError(err.message || 'Something went wrong. Please try again.');
      }
    }
  };

  // ─── Handle Sign Up ─────────────────────────────────────────────────────────
  const handleSignUp = async (values: SignUpForm) => {
    setApiError('');
    setApiSuccess('');
    try {
      const result = await signUp(values.email, values.password, values.fullName);
      if (result?.session) {
        router.replace('/onboarding' as any);
      } else if (result?.user) {
        setApiSuccess('Account created! Please check your email inbox to verify your account before logging in.');
        signUpForm.reset();
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

  // ─── Handle Google OAuth ────────────────────────────────────────────────────
  // ─── Handle Google OAuth ────────────────────────────────────────────────────
  const handleGoogleAuth = async () => {
    setApiError('');
    try {
      const res = await authService.signInWithGoogle();
      if (res.error) throw new Error(res.error as any);
      // After successful OAuth, fetch the current user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Google sign-in failed');
      await resolveAndRedirect(authUser.id);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('network')) {
        setApiError('Network error. Please check your internet connection and try again.');
      } else {
        setApiError(err.message || 'Google sign-in failed.');
      }
    }
  };


  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Floating decorative shapes */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {shapes.map((s, i) => (
          <FloatingShape key={i} {...s} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <AutopilotLogo size="lg" variant={isDark ? 'light' : 'dark'} />
        </View>

        {/* Heading */}
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {authMode === 'signup'
            ? 'Get started with your facility management hub'
            : 'Sign in to your facility management hub'}
        </Text>

        {/* Tab Switcher — pill style */}
        <View style={[styles.tabContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <TouchableOpacity
            style={[styles.tab, authMode === 'signin' && { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' }]}
            onPress={() => { setAuthMode('signin'); setApiError(''); setApiSuccess(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, { color: authMode === 'signin' ? theme.textPrimary : theme.textTertiary }]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, authMode === 'signup' && { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' }]}
            onPress={() => { setAuthMode('signup'); setApiError(''); setApiSuccess(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, { color: authMode === 'signup' ? theme.textPrimary : theme.textTertiary }]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Sign In Form ─── */}
        {authMode === 'signin' && (
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Email</Text>
              <Controller
                control={signInForm.control}
                name="email"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
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
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.textPrimary }]}>Password</Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                  <Text style={[styles.forgotLink, { color: theme.primary }]}>Forgot?</Text>
                </TouchableOpacity>
              </View>
              <Controller
                control={signInForm.control}
                name="password"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
                        placeholder="Enter your password"
                        placeholderTextColor={theme.textTertiary}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
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
              style={[styles.submitButton, { backgroundColor: theme.primary, opacity: isSignInLoading ? 0.7 : 1 }]}
              onPress={signInForm.handleSubmit(handleSignIn)}
              disabled={isSignInLoading}
              activeOpacity={0.8}
            >
              {isSignInLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.submitRow}>
                  <Text style={styles.submitText}>Sign In</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* OAuth Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or continue with</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.oauthButton, { borderColor: theme.border }]}            
              onPress={handleGoogleAuth}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={[styles.oauthText, { color: theme.textPrimary }]}>Sign in with Google</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Sign Up Form ─── */}
        {authMode === 'signup' && (
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Full Name</Text>
              <Controller
                control={signUpForm.control}
                name="fullName"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="person-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
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
              <Text style={[styles.label, { color: theme.textPrimary }]}>Email</Text>
              <Controller
                control={signUpForm.control}
                name="email"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
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
              <Text style={[styles.label, { color: theme.textPrimary }]}>Password</Text>
              <Controller
                control={signUpForm.control}
                name="password"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
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
              <Text style={[styles.label, { color: theme.textPrimary }]}>Confirm Password</Text>
              <Controller
                control={signUpForm.control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
                  <>
                    <View style={[styles.inputWrapper, { borderBottomColor: error ? theme.error : theme.border }]}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }]}
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
              style={[styles.submitButton, { backgroundColor: theme.primary, opacity: isSignUpLoading ? 0.7 : 1 }]}
              onPress={signUpForm.handleSubmit(handleSignUp)}
              disabled={isSignUpLoading}
              activeOpacity={0.8}
            >
              {isSignUpLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.submitRow}>
                  <Text style={styles.submitText}>Create Account</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* OAuth Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or continue with</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.oauthButton, { borderColor: theme.border }]}
              onPress={handleGoogleAuth}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={[styles.oauthText, { color: theme.textPrimary }]}>Sign up with Google</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          {authMode === 'signin' ? (
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              Don't have an account?{' '}
              <Text
                style={[styles.footerLink, { color: theme.primary }]}
                onPress={() => { setAuthMode('signup'); setApiError(''); setApiSuccess(''); }}
              >
                Sign Up
              </Text>
            </Text>
          ) : (
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              Already have an account?{' '}
              <Text
                style={[styles.footerLink, { color: theme.primary }]}
                onPress={() => { setAuthMode('signin'); setApiError(''); setApiSuccess(''); }}
              >
                Sign In
              </Text>
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },

  // Floating shapes
  floatingShape: {
    position: 'absolute',
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },

  // Heading
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: FONT_TRACKING.display,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },

  // Tab Switcher
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
    alignSelf: 'center',
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },

  // Form
  form: {
    gap: 0,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  eyeButton: {
    padding: 4,
  },
  fieldError: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
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
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  submitButton: {
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: FONT_TRACKING.tight,
    fontFamily: FONT_FAMILY,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: FONT_FAMILY,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  oauthText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  footer: {
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
  footerLink: {
    fontWeight: '700',
    letterSpacing: FONT_TRACKING.body,
    fontFamily: FONT_FAMILY,
  },
});
