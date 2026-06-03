'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Animated,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/lib/serverApi';
import { Colors, DesignTokens } from '@/constants/Colors';
import { useOnboardingStore } from '@/store/onboardingStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Property {
  id: string;
  name: string;
  code: string;
  organization_id: string;
}

interface DbUser {
  full_name: string;
  phone: string;
}

interface OrgRow {
  id: string;
}

interface SkillGroupRow {
  id: string;
  code: string;
}

const AVAILABLE_ROLES = [
  { id: 'property_admin', label: 'Property Admin', desc: 'Manage property ops & staff', icon: 'business', emoji: '🏢' },
  { id: 'staff', label: 'Soft Services', desc: 'Cleaning, hygiene & support', icon: 'construct', emoji: '👷' },
  { id: 'mst', label: 'Maintenance', desc: 'Technical repairs & maintenance', icon: 'build', emoji: '🔧' },
  { id: 'security', label: 'Security', desc: 'Property security & access', icon: 'shield-checkmark', emoji: '🛡️' },
  { id: 'tenant', label: 'Client', desc: 'Raise requests & view updates', icon: 'home', emoji: '🏠' },
  { id: 'vendor', label: 'Vendor', desc: 'Manage shop revenue & orders', icon: 'storefront', emoji: '🍔' },
];

const SKILL_OPTIONS: Record<string, { code: string; label: string }[]> = {
  mst: [
    { code: 'technical', label: 'Technical' },
    { code: 'plumbing', label: 'Plumbing' },
    { code: 'vendor_coord', label: 'Vendor Coordination' },
  ],
  staff: [
    { code: 'soft_services', label: 'Soft Services' },
    { code: 'soft_service_manager', label: 'Soft Service Manager' },
  ],
};

const AUTOPILOT_ORG_ID = process.env.EXPO_PUBLIC_AUTOPILOT_ORG_ID;

// Roles that see the voice enrollment step
const VOICE_OPTIONAL_ROLES = ['tenant', 'vendor'];
// Roles where voice enrollment is REQUIRED but can be deferred
const VOICE_ELIGIBLE_ROLES = ['property_admin', 'staff', 'mst', 'security', ...VOICE_OPTIONAL_ROLES];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i <= step && styles.progressDotActive,
            ]}
          />
        ))}
      </View>
      <Text style={styles.progressLabel}>Step {step + 1} of {total}</Text>
    </View>
  );
}

function StepCard({ children, bgColor }: { children: React.ReactNode; bgColor: string }) {
  return (
    <View style={[styles.stepCard, { backgroundColor: bgColor }]}>
      {children}
    </View>
  );
}

// ─── Custom focus tracking (expo-router doesn't export useIsFocused) ───────────
function useIsOnScreen(): boolean {
  const [isOnScreen, setIsOnScreen] = useState(true);
  useEffect(() => {
    setIsOnScreen(true);
    return () => setIsOnScreen(false);
  }, []);
  return isOnScreen;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();
  const isFocused = useIsOnScreen();
  const { user, refreshMembership } = useAuth();
  const supabase = createClient();
  const {
    voiceEnrollmentDone,
    voiceEnrollmentSkipped,
    voiceEnrollmentCompletedAt,
    reset: resetVoiceState,
  } = useOnboardingStore();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [voiceEnrolled, setVoiceEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [error, setError] = useState('');
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ─── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/(auth)/login');
    }
  }, [user, loading, router]);

  // ─── Handle return from voice-enrollment screen ─────────────────────────────
  useEffect(() => {
    if (!isFocused) return;
    if (step !== 4) return; // only act when on the voice step
    if (!voiceEnrollmentCompletedAt) return;

    // Only react to store updates that happened during this step
    // (voiceEnrollmentCompletedAt > 0 means a return from voice-enrollment)
    if (voiceEnrollmentDone) {
      setVoiceEnrolled(true);
      resetVoiceState();
      goNext(); // advance from step 4
    } else if (voiceEnrollmentSkipped) {
      resetVoiceState();
      goNext(); // advance from step 4 (skip path handled in goNext)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, voiceEnrollmentCompletedAt, voiceEnrollmentDone, voiceEnrollmentSkipped]);

  // ─── Init: get user name ─────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!user) return;

      const nameFromMeta = user.user_metadata?.full_name || user.user_metadata?.name;
      if (nameFromMeta) {
        setUserName(nameFromMeta.split(' ')[0]);
      } else {
        const { data: dbUser } = await supabase
          .from('users')
          .select('full_name, phone')
          .eq('id', user.id)
          .maybeSingle() as { data: DbUser | null };

        setUserName(dbUser?.full_name?.split(' ')[0] ?? 'there');
        if (dbUser?.phone) setPhoneNumber(dbUser.phone);
      }

      // Check if already voice enrolled
      const { data: emb } = await supabase
        .from('user_voice_embeddings' as any)
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (emb) setVoiceEnrolled(true);

      setLoading(false);
    };

    init();
  }, [user, supabase]);

  // ─── Fetch properties ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;

    const fetchProps = async () => {
      setLoading(true);
      setError('');
      try {
        // Resolve org ID: env var first, then query DB fallback
        let orgId = AUTOPILOT_ORG_ID;
        if (!orgId) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .or(`code.eq.autopilot,name.ilike.%autopilot%`)
            .limit(1)
            .maybeSingle() as { data: OrgRow | null };
          orgId = org?.id;
        }
        setResolvedOrgId(orgId ?? null);

        if (!orgId) {
          setProperties([]);
          setLoading(false);
          return;
        }

        const { data, error: err } = await supabase
          .from('properties')
          .select('id, name, code, organization_id')
          .eq('organization_id', orgId)
          .order('name');

        if (err) throw err;
        setProperties((data as Property[]) ?? []);
      } catch (e: any) {
        console.error('Properties fetch error:', e);
        setError(e.message || 'Failed to load properties.');
      } finally {
        setLoading(false);
      }
    };

    fetchProps();
  }, [step, supabase]);

  // ─── Animate step transitions ───────────────────────────────────────────────
  const animateToStep = (nextStep: number) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: nextStep > step ? -30 : 30,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(nextStep);
      slideAnim.setValue(nextStep > step ? 30 : -30);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const goNext = () => {
    setError('');

    if (step === 3) {
      // Role selected — check if voice step needed
      const needsVoice = VOICE_ELIGIBLE_ROLES.includes(selectedRole ?? '');
      const showVoiceStep = needsVoice && !voiceEnrolled;

      if (showVoiceStep && (selectedRole === 'mst' || selectedRole === 'staff')) {
        animateToStep(5); // skills → voice enrollment → complete
      } else if (showVoiceStep) {
        animateToStep(4); // role → voice enrollment → complete
      } else if (selectedRole === 'mst' || selectedRole === 'staff') {
        handleComplete();
      } else {
        handleComplete();
      }
    } else if (step === 4) {
      // After voice step, go to skills or complete
      if (selectedRole === 'mst' || selectedRole === 'staff') {
        animateToStep(5);
      } else {
        handleComplete();
      }
    } else if (step === 5) {
      handleComplete();
    } else {
      animateToStep(step + 1);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 0) {
      router.replace('/login');
      return;
    }
    if (step === 4 && (selectedRole === 'mst' || selectedRole === 'staff')) {
      animateToStep(3);
    } else if (step === 5) {
      animateToStep(4);
    } else if (step > 0) {
      animateToStep(step - 1);
    }
  };

  // ─── Completion ─────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!user || !selectedProperty || !selectedRole) return;

    setSubmitting(true);
    setError('');

    try {
      const authUser = user;
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      let finalPropId = selectedProperty.id;
      if (finalPropId === 'default') {
        const orgId = resolvedOrgId ?? AUTOPILOT_ORG_ID;
        if (!orgId) {
          throw new Error('No organization configured. Please contact support.');
        }
        const { data: rp } = await supabase
          .from('properties')
          .select('id')
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle() as { data: { id: string } | null };
        if (rp) finalPropId = rp.id;
        else throw new Error('No properties found for this organization. Please contact support.');
      }

      let targetOrgId = resolvedOrgId ?? AUTOPILOT_ORG_ID ?? '';
      if (!targetOrgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .or(`code.eq.autopilot,name.ilike.%autopilot%`)
          .limit(1)
          .maybeSingle() as { data: OrgRow | null };
        if (org) targetOrgId = org.id;
      }

      // Validate UUIDs before insert
      if (!targetOrgId || !UUID_REGEX.test(targetOrgId)) {
        throw new Error('Invalid organization ID. Please contact support.');
      }
      if (!finalPropId || !UUID_REGEX.test(finalPropId)) {
        throw new Error('Invalid property ID. Please contact support.');
      }

      const finalRole = (selectedRole === 'staff' && selectedSkills.includes('soft_service_manager'))
        ? 'soft_service_manager'
        : selectedRole;

      // Insert property membership
      const { error: memErr } = await (supabase
        .from('property_memberships')
        .insert({
          user_id: authUser.id,
          organization_id: targetOrgId,
          property_id: finalPropId,
          role: finalRole,
          is_active: true,
        } as any) as any);

      if (memErr && !memErr.message.toLowerCase().includes('duplicate')) {
        throw memErr;
      }

      // Vendor record
      if (selectedRole === 'vendor') {
        const dbUserRes = await serverApi.query<{ full_name: string }>({ table: 'users', action: 'select', select: 'full_name', filters: [{ op: 'eq', column: 'id', value: authUser.id }], maybeSingle: true });
        try {
          await serverApi.query({
            table: 'vendors',
            action: 'insert',
            values: {
              user_id: authUser.id,
              property_id: finalPropId,
              shop_name: `${userName}'s Shop`,
              vendor_name: dbUserRes.data?.full_name || userName,
              commission_rate: 10,
              status: 'active',
            },
          });
        } catch { /* Ignore dupes */ }
      }

      // MST skills
      if (selectedSkills.length > 0) {
        const skillsToInsert = selectedSkills.map(code => ({ user_id: authUser.id, skill_code: code }));
        try {
          await serverApi.query({ table: 'mst_skills', action: 'insert', values: skillsToInsert });
        } catch { /* Ignore */ }

        // Resolver stats
        const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor_coord'];
        const VALID_STAFF_SKILLS = ['soft_services'];
        const skillsForResolver = selectedRole === 'mst'
          ? selectedSkills.filter(s => VALID_MST_SKILLS.includes(s))
          : (selectedRole === 'staff' ? selectedSkills.filter(s => VALID_STAFF_SKILLS.includes(s)) : []);

        if (skillsForResolver.length > 0) {
          const sgRes = await serverApi.query<{ id: string; code: string }[]>({ table: 'skill_groups', action: 'select', select: 'id, code', filters: [{ op: 'eq', column: 'is_active', value: true }, { op: 'in', column: 'code', values: skillsForResolver }] });
          if (sgRes.data?.length) {
            const stats = sgRes.data.map(sg => ({
              user_id: authUser.id,
              property_id: finalPropId,
              skill_group_id: sg.id,
              current_floor: 1,
              avg_resolution_minutes: 60,
              total_resolved: 0,
              is_available: true,
            }));
            try {
              await serverApi.query({ table: 'resolver_stats', action: 'insert', values: stats });
            } catch { /* Ignore */ }
          }
        }
      }

      // Upsert user profile (upsert = safety net in case the row doesn't exist yet,
      // e.g. signup happened through a path that didn't create the users row)
      const cleanPhone = phoneNumber.trim();
      const profileUpsert: Record<string, string> = {};
      if (cleanPhone.length >= 10) profileUpsert.phone = cleanPhone;
      profileUpsert.full_name = authUser.user_metadata?.full_name ?? userName;
      // TODO: onboarding_completed does not exist on the users table

      const userRes = await serverApi.query({
        table: 'users',
        action: 'upsert',
        values: {
          id: authUser.id,
          email: authUser.email ?? '',
          ...profileUpsert,
        },
        mutationOptions: { onConflict: 'id' },
      });
      if (userRes.error) throw new Error(userRes.error.message);

      await supabase.auth.updateUser({ data: { onboarding_completed: true } });

      // Refresh membership cache so the app sees the new property membership
      await refreshMembership();

      setShowFireworks(true);
    } catch (err: any) {
      console.error('Onboarding complete error:', err);
      setError(err.message || 'Failed to complete setup.');
      setSubmitting(false);
    }
  };

  const handleFireworksDone = () => {
    setShowFireworks(false);
    router.replace('/');
  };

  const toggleSkill = (code: string) => {
    setSelectedSkills(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // ─── Derived state ───────────────────────────────────────────────────────────
  const showSkillsStep = selectedRole === 'mst' || selectedRole === 'staff';
  const needsVoice = VOICE_ELIGIBLE_ROLES.includes(selectedRole ?? '');
  const showVoiceStep = needsVoice && !voiceEnrolled && step >= 4;

  // Total visible steps: 0=welcome, 1=phone, 2=property, 3=role, 4+=voice, 5=skills
  const visibleSteps = 6; // fixed
  const showSkillsInCount = showSkillsStep ? 6 : 5;

  const canProceed = () => {
    switch (step) {
      case 1: return phoneNumber.length === 0 || phoneNumber.length >= 10;
      case 2: return selectedProperty !== null;
      case 3: return selectedRole !== null;
      case 5: return selectedSkills.length > 0;
      default: return true;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading && step === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading your workspace...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Fireworks overlay */}
      {showFireworks && (
        <View style={styles.fireworksOverlay}>
          <Text style={styles.fireworksEmoji}>🎉</Text>
          <Text style={styles.fireworksTitle}>Welcome Aboard!</Text>
          <Text style={styles.fireworksSubtitle}>Your workspace is ready</Text>
          <TouchableOpacity style={styles.fireworksButton} onPress={handleFireworksDone}>
            <Text style={styles.fireworksButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <ProgressBar step={step} total={showSkillsStep ? 6 : 5} />

        {/* Step content with animation */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }],
          }}
        >
          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <StepCard bgColor={theme.card}>
              <View style={styles.welcomeIconContainer}>
                <View style={[styles.welcomeIcon, { backgroundColor: theme.primaryLight + '20' }]}>
                  <Ionicons name="sparkles" size={40} color={theme.primary} />
                </View>
              </View>
              <Text style={[styles.welcomeTitle, { color: theme.text }]}>
                Hello, <Text style={{ color: theme.primary }}>{userName}</Text>!
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
                Welcome to Autopilot Offices
              </Text>
              <Text style={[styles.welcomeBody, { color: theme.textTertiary }]}>
                Let's get you set up in just a few steps. We'll help you choose your workspace.
              </Text>
            </StepCard>
          )}

          {/* ── Step 1: Phone ── */}
          {step === 1 && (
            <StepCard bgColor={theme.card}>
              <View style={[styles.stepIconWrap, { backgroundColor: theme.info + '15' }]}>
                <Ionicons name="call-outline" size={28} color={theme.info} />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Contact Details</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Mobile number <Text style={{ color: theme.textTertiary }}>(optional)</Text>
              </Text>

              <View style={[styles.phoneInput, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.phonePrefix, { color: theme.textSecondary }]}>+91</Text>
                <View style={[styles.phoneDivider, { backgroundColor: theme.border }]} />
                <TextInput
                  style={[styles.phoneTextInput, { color: theme.text }]}
                  placeholder="9876543210"
                  placeholderTextColor={theme.textTertiary}
                  value={phoneNumber}
                  onChangeText={t => setPhoneNumber(t.replace(/[^0-9]/g, '').slice(0, 15))}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
              </View>

              <Text style={[styles.phoneNote, { color: theme.textTertiary }]}>
                Used for important notifications only.
              </Text>
            </StepCard>
          )}

          {/* ── Step 2: Property ── */}
          {step === 2 && (
            <StepCard bgColor={theme.card}>
              <View style={[styles.stepIconWrap, { backgroundColor: theme.success + '15' }]}>
                <Ionicons name="business-outline" size={28} color={theme.success} />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Choose Your Property</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Select the property you'll be managing
              </Text>

              {loading ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 20 }} />
              ) : (
                <View style={styles.propertyList}>
                  {properties.length === 0 ? (
                    <TouchableOpacity
                      style={[styles.propertyCard, { borderColor: theme.border }]}
                      onPress={() => setSelectedProperty({ id: 'default', name: 'Main Campus', code: 'main', organization_id: resolvedOrgId ?? AUTOPILOT_ORG_ID ?? 'default' })}
                    >
                      <Text style={[styles.propertyEmoji]}>🏢</Text>
                      <View style={styles.propertyInfo}>
                        <Text style={[styles.propertyName, { color: theme.text }]}>Main Campus</Text>
                        <Text style={[styles.propertyCode, { color: theme.textTertiary }]}>Tap to use default</Text>
                      </View>
                      {selectedProperty?.id === 'default' && (
                        <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                      )}
                    </TouchableOpacity>
                  ) : (
                    properties.map(prop => (
                      <TouchableOpacity
                        key={prop.id}
                        style={[
                          styles.propertyCard,
                          { borderColor: selectedProperty?.id === prop.id ? theme.success : theme.border },
                          selectedProperty?.id === prop.id && { backgroundColor: theme.success + '10' },
                        ]}
                        onPress={() => setSelectedProperty(prop)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.propertyEmoji}>🏢</Text>
                        <View style={styles.propertyInfo}>
                          <Text style={[styles.propertyName, { color: theme.text }]}>{prop.name}</Text>
                          <Text style={[styles.propertyCode, { color: theme.textTertiary }]}>{prop.code}</Text>
                        </View>
                        {selectedProperty?.id === prop.id && (
                          <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {error ? (
                <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
              ) : null}
            </StepCard>
          )}

          {/* ── Step 3: Role ── */}
          {step === 3 && (
            <StepCard bgColor={theme.card}>
              <View style={[styles.stepIconWrap, { backgroundColor: theme.warning + '15' }]}>
                <Ionicons name="person-circle-outline" size={28} color={theme.warning} />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Choose Your Role</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                How will you be using Autopilot?
              </Text>

              <View style={styles.roleList}>
                {AVAILABLE_ROLES.map(role => {
                  const isSelected = selectedRole === role.id;
                  return (
                    <TouchableOpacity
                      key={role.id}
                      style={[
                        styles.roleCard,
                        { borderColor: isSelected ? theme.primary : theme.border },
                        isSelected && { backgroundColor: theme.primary + '10' },
                      ]}
                      onPress={() => setSelectedRole(role.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roleIconWrap, { backgroundColor: isSelected ? theme.primary : theme.surface }]}>
                        <Text style={styles.roleEmoji}>{role.emoji}</Text>
                      </View>
                      <View style={styles.roleInfo}>
                        <Text style={[styles.roleLabel, { color: theme.text }]}>{role.label}</Text>
                        <Text style={[styles.roleDesc, { color: theme.textTertiary }]}>{role.desc}</Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </StepCard>
          )}

          {/* ── Step 4: Voice Enrollment ── */}
          {step === 4 && (
            <StepCard bgColor={theme.card}>
              <View style={[styles.stepIconWrap, { backgroundColor: '#a855f7' + '15' }]}>
                <Ionicons name="mic-outline" size={28} color="#a855f7" />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Voice Enrollment</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                {VOICE_OPTIONAL_ROLES.includes(selectedRole ?? '') ? 'Optional: ' : ''}
                Set up voice authentication for hands-free access
              </Text>

              <View style={styles.voiceCard}>
                <View style={[styles.voiceMicRing, { borderColor: '#a855f7' + '30' }]}>
                  <View style={[styles.voiceMicInner, { backgroundColor: '#a855f7' + '10' }]}>
                    <Ionicons name="mic" size={32} color="#a855f7" />
                  </View>
                </View>
                <Text style={[styles.voiceInstruction, { color: theme.textSecondary }]}>
                  You'll need to say 3 short phrases to enroll your voice
                </Text>
                <TouchableOpacity
                  style={[styles.voiceEnrollButton, { backgroundColor: '#a855f7' }]}
                  onPress={() => router.push('/(auth)/voice-enrollment' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mic" size={18} color="#fff" />
                  <Text style={styles.voiceEnrollButtonText}>Enroll Voice</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.voiceSkipButton}
                  onPress={() => {
                    setVoiceEnrolled(false);
                    if (selectedRole === 'mst' || selectedRole === 'staff') {
                      animateToStep(5);
                    } else {
                      handleComplete();
                    }
                  }}
                >
                  <Text style={[styles.voiceSkipText, { color: theme.textTertiary }]}>
                    {VOICE_OPTIONAL_ROLES.includes(selectedRole ?? '') ? 'Skip for now' : 'Set up later in Profile'}
                  </Text>
                </TouchableOpacity>
              </View>
            </StepCard>
          )}

          {/* ── Step 5: Skills ── */}
          {step === 5 && SKILL_OPTIONS[selectedRole ?? ''] && (
            <StepCard bgColor={theme.card}>
              <View style={[styles.stepIconWrap, { backgroundColor: theme.info + '15' }]}>
                <Ionicons name="construct-outline" size={28} color={theme.info} />
              </View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Select Your Skills</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                What kind of tasks do you handle?
              </Text>

              <View style={styles.skillList}>
                {(SKILL_OPTIONS[selectedRole!] ?? []).map(skill => {
                  const isSelected = selectedSkills.includes(skill.code);
                  return (
                    <TouchableOpacity
                      key={skill.code}
                      style={[
                        styles.skillCard,
                        { borderColor: isSelected ? theme.info : theme.border },
                        isSelected && { backgroundColor: theme.info + '10' },
                      ]}
                      onPress={() => toggleSkill(skill.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.skillLabel, { color: theme.text }]}>{skill.label}</Text>
                      <View style={[styles.skillCheck, { borderColor: isSelected ? theme.info : theme.border, backgroundColor: isSelected ? theme.info : 'transparent' }]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </StepCard>
          )}
        </Animated.View>

        {/* Error */}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.errorBg, borderColor: theme.errorBorder }]}>
            <Ionicons name="alert-circle" size={16} color={theme.error} style={{ marginRight: 8 }} />
            <Text style={[styles.errorBoxText, { color: theme.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Navigation */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBack}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={18} color={theme.primary} />
            <Text style={[styles.backText, { color: theme.primary }]}>{step === 0 ? 'Back to Login' : 'Back'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.nextButton,
              { backgroundColor: canProceed() ? theme.primary : theme.border },
            ]}
            onPress={goNext}
            disabled={!canProceed() || submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.nextText}>
                  {step === (showSkillsStep ? 5 : 4) ? 'Complete Setup' : 'Continue'}
                </Text>
                <Ionicons name={step === (showSkillsStep ? 5 : 4) ? 'checkmark' : 'arrow-forward'} size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Dev skip — only on welcome screen */}
        {step === 0 && (
          <TouchableOpacity
            onPress={async () => {
              await supabase.auth.updateUser({ data: { onboarding_completed: true } });
              router.replace('/(auth)/property-selection');
            }}
            style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}
          >
            <Text style={{ color: theme.textTertiary, fontSize: 12 }}>Skip onboarding (dev)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: 'Urbanist-Regular',
  },

  // Progress
  progressContainer: { marginBottom: 28 },
  progressTrack: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(112,143,150,0.2)',
  },
  progressDotActive: { backgroundColor: '#708F96' },
  progressLabel: {
    fontSize: 12,
    fontFamily: 'Urbanist-Medium',
    color: '#708F96',
    textAlign: 'center',
  },

  // Step card
  stepCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },

  // Welcome
  welcomeIconContainer: { alignItems: 'center', marginBottom: 20 },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 17,
    textAlign: 'center',
    fontFamily: 'Urbanist-Medium',
    marginBottom: 8,
  },
  welcomeBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: 'Urbanist-Regular',
  },

  // Step header
  stepIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    fontFamily: 'Urbanist-Medium',
    marginBottom: 20,
  },

  // Phone
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 54,
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
    marginRight: 4,
  },
  phoneDivider: {
    width: 1,
    height: 28,
    marginRight: 10,
  },
  phoneTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
    letterSpacing: 1,
  },
  phoneNote: {
    fontSize: 12,
    fontFamily: 'Urbanist-Regular',
    marginTop: 10,
    textAlign: 'center',
  },

  // Property
  propertyList: { gap: 10 },
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  propertyEmoji: { fontSize: 24, marginRight: 12 },
  propertyInfo: { flex: 1 },
  propertyName: { fontSize: 16, fontWeight: '700', fontFamily: 'Urbanist-Bold' },
  propertyCode: { fontSize: 12, fontFamily: 'Urbanist-Regular', marginTop: 2 },

  // Role
  roleList: { gap: 10 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  roleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  roleEmoji: { fontSize: 24 },
  roleInfo: { flex: 1 },
  roleLabel: { fontSize: 15, fontWeight: '700', fontFamily: 'Urbanist-Bold' },
  roleDesc: { fontSize: 12, fontFamily: 'Urbanist-Regular', marginTop: 2 },

  // Voice
  voiceCard: { alignItems: 'center', paddingVertical: 8 },
  voiceMicRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceMicInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInstruction: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Urbanist-Regular',
    marginBottom: 20,
    lineHeight: 20,
  },
  voiceEnrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  voiceEnrollButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },
  voiceSkipButton: { padding: 8 },
  voiceSkipText: {
    fontSize: 13,
    fontFamily: 'Urbanist-Regular',
    textDecorationLine: 'underline',
  },

  // Skills
  skillList: { gap: 10 },
  skillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
  },
  skillLabel: { fontSize: 15, fontWeight: '600', fontFamily: 'Urbanist-SemiBold' },
  skillCheck: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Error
  errorText: { fontSize: 13, fontFamily: 'Urbanist-Regular', marginTop: 8, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBoxText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
  },

  // Navigation
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backButtonHidden: { opacity: 0 },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Urbanist-SemiBold',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    maxWidth: 200,
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },

  // Fireworks
  fireworksOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  fireworksEmoji: { fontSize: 72, marginBottom: 16 },
  fireworksTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    fontFamily: 'Urbanist-Bold',
    marginBottom: 8,
  },
  fireworksSubtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Urbanist-Medium',
    marginBottom: 32,
  },
  fireworksButton: {
    backgroundColor: '#708F96',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 12,
  },
  fireworksButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Urbanist-Bold',
  },
});
