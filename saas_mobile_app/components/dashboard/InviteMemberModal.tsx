import React, { useState } from 'react';
import { serverApi } from '@/lib/serverApi';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '@/utils/supabase/client';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  properties: { id: string; name: string }[];
  fixedPropertyId?: string;
  onSuccess?: () => void;
}

const ROLES = [
  { value: 'property_admin', label: 'Property Admin', group: 'Admin' },
  { value: 'staff', label: 'General Staff', group: 'Staff' },
  { value: 'soft_service_staff', label: 'Soft Service Staff', group: 'Staff' },
  { value: 'mst', label: 'MST (Maintenance)', group: 'Staff' },
  { value: 'security', label: 'Security', group: 'Other' },
  { value: 'tenant', label: 'Client', group: 'Other' },
  { value: 'vendor', label: 'Food Vendor', group: 'Other' },
];

const SKILL_MAP: Record<string, { code: string; label: string; icon: keyof typeof Ionicons.glyphMap }[]> = {
  mst: [
    { code: 'technical', label: 'Technical', icon: 'build-outline' },
    { code: 'plumbing', label: 'Plumbing', icon: 'hammer-outline' },
    { code: 'vendor', label: 'Vendor Coordination', icon: 'briefcase-outline' },
  ],
  staff: [
    { code: 'technical', label: 'Technical', icon: 'build-outline' },
    { code: 'soft_services', label: 'Soft Services', icon: 'sparkles-outline' },
  ],
  soft_service_staff: [
    { code: 'soft_services', label: 'Soft Services', icon: 'sparkles-outline' },
  ],
};

export default function InviteMemberModal({ isOpen, onClose, orgId, orgName, properties, fixedPropertyId, onSuccess }: AddMemberModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('staff');
  const [selectedPropertyId, setSelectedPropertyId] = useState(fixedPropertyId || '');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const toggleSkill = (code: string) => {
    setSelectedSkills(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Direct Supabase admin creation via RPC or edge function
      const { data, error: createError } = await serverApi.rpc('create_user_with_membership', {
        p_email: email,
        p_password: password,
        p_full_name: fullName,
        p_organization_id: orgId,
        p_role: role,
        p_property_id: selectedPropertyId || null,
        p_skills: selectedSkills,
      });

      if (createError) throw createError;

      onSuccess?.();
      onClose();
      // Reset
      setFullName(''); setEmail(''); setPassword(''); setRole('staff'); setSelectedSkills([]);
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const skills = SKILL_MAP[role] || [];

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="person-add-outline" size={24} color="#FFF" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Add New Member</Text>
                <Text style={styles.headerSub}>Create an account for {orgName}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="John Doe" placeholderTextColor="#94A3B8" />
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="john@example.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput style={[styles.input, { paddingRight: 48 }]} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#94A3B8" secureTextEntry={!showPassword} />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Role */}
            <View style={styles.field}>
              <Text style={styles.label}>Role</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity key={r.value} style={[styles.roleChip, role === r.value && styles.roleChipActive]} onPress={() => setRole(r.value)}>
                      <Text style={[styles.roleChipText, role === r.value && styles.roleChipTextActive]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Property */}
            {!fixedPropertyId && (
              <View style={styles.field}>
                <Text style={styles.label}>Target Property</Text>
                {properties.map(p => (
                  <TouchableOpacity key={p.id} style={[styles.propItem, selectedPropertyId === p.id && styles.propItemActive]} onPress={() => setSelectedPropertyId(p.id)}>
                    <Ionicons name="business-outline" size={16} color={selectedPropertyId === p.id ? '#708F96' : '#94A3B8'} />
                    <Text style={[styles.propText, selectedPropertyId === p.id && { color: '#708F96', fontWeight: '700' }]}>{p.name}</Text>
                    {selectedPropertyId === p.id && <Ionicons name="checkmark-circle" size={18} color="#708F96" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Member Skills</Text>
                {skills.map(skill => {
                  const isSelected = selectedSkills.includes(skill.code);
                  return (
                    <TouchableOpacity key={skill.code} style={[styles.skillItem, isSelected && styles.skillItemActive]} onPress={() => toggleSkill(skill.code)}>
                      <View style={styles.skillLeft}>
                        <View style={[styles.skillIcon, isSelected && { backgroundColor: '#708F96' }]}>
                          <Ionicons name={skill.icon} size={16} color={isSelected ? '#FFF' : '#94A3B8'} />
                        </View>
                        <Text style={[styles.skillText, isSelected && { color: '#FFF' }]}>{skill.label}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Submit */}
          <TouchableOpacity style={[styles.submitBtn, isSubmitting && { opacity: 0.5 }]} onPress={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.submitText}>Create Member Account</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#708F96', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A2332' },
  headerSub: { fontSize: 13, color: '#94A3B8' },
  closeBtn: { padding: 8 },
  field: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  input: { height: 48, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 16, fontSize: 14, fontWeight: '700', color: '#1A2332' },
  eyeBtn: { position: 'absolute', right: 16, top: 14 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
  roleChipActive: { backgroundColor: '#708F96', borderColor: '#708F96' },
  roleChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  roleChipTextActive: { color: '#FFF' },
  propItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 6 },
  propItemActive: { borderColor: '#708F96', backgroundColor: 'rgba(124,58,237,0.04)' },
  propText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#64748B' },
  skillItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', marginBottom: 6 },
  skillItemActive: { backgroundColor: '#708F96', borderColor: '#708F96' },
  skillLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skillIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  skillText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  errorBox: { backgroundColor: 'rgba(244,63,94,0.08)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)', borderRadius: 16, padding: 16, marginBottom: 16 },
  errorText: { fontSize: 13, fontWeight: '700', color: '#F43F5E' },
  submitBtn: { backgroundColor: '#708F96', borderRadius: 16, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 16, fontWeight: '900', color: '#FFF' },
});
