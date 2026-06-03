import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '@/constants/designSystem';
import { useTheme } from '@/context';
import { createClient } from '@/utils/supabase/client';

interface SOPChecklistRunnerProps {
  templateId?: string;
  completionId?: string;
  propertyId?: string;
  /** Optional ticket to log SOP execution against ticket_activity_log */
  ticketId?: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
}

export default function SOPChecklistRunner({
  templateId,
  completionId,
  propertyId: propId,
  ticketId,
}: SOPChecklistRunnerProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { propertyId: routeId } = useLocalSearchParams<{ propertyId: string }>();
  const pid = propId || routeId;
  const isDark = theme === 'dark';
  const supabase = createClient();

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!!templateId);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);
    supabase
      .from('sop_templates')
      .select('title, sop_checklist_items(id, title, description, is_required, sort_order)')
      .eq('id', templateId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setTemplateTitle(data.title);
          setItems(
            (data.sop_checklist_items ?? []).sort(
              (a: ChecklistItem, b: ChecklistItem) => a.sort_order - b.sort_order
            )
          );
        }
        setLoading(false);
      });
  }, [templateId]);

  const toggleItem = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleComplete = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (completionId) {
        await supabase
          .from('sop_completions')
          .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: user?.id ?? null })
          .eq('id', completionId);

        // Upsert per-item completion records
        if (items.length > 0) {
          await supabase.from('sop_completion_items').upsert(
            items.map(item => ({
              completion_id: completionId,
              checklist_item_id: item.id,
              is_completed: checked.has(item.id),
              completed_by: user?.id ?? null,
              completed_at: checked.has(item.id) ? new Date().toISOString() : null,
            }))
          );
        }
      }

      // Log to ticket_activity_log if a ticket is linked
      if (ticketId && user?.id) {
        await supabase.from('ticket_activity_log').insert({
          ticket_id: ticketId,
          user_id: user.id,
          action: 'sop_checklist_completed',
          new_value: templateTitle ?? templateId ?? 'SOP checklist completed',
        });
      }

      setDone(true);
    } catch (err) {
      console.warn('[SOPChecklistRunner] complete error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, completionId, items, checked, ticketId, templateTitle, templateId]);

  const bgGradient = isDark ? ['#0F1419', '#1A1F2E'] as const : ['#F8FAFC', '#EEF2F6'] as const;

  if (!templateId) {
    return (
      <View style={styles.fallback}>
        <GlassCard style={styles.card}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>Checklist Runner</Text>
          <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
            Run and complete your assigned checklists.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push(`/property/${pid}/checklist` as any)} activeOpacity={0.8}>
            <LinearGradient colors={['#708F96', '#5A737A']} style={styles.gradient}>
              <Text style={styles.btnText}>Open Checklist</Text>
              <ArrowRight size={16} color="#FFFFFF" strokeWidth={2} />
            </LinearGradient>
          </TouchableOpacity>
        </GlassCard>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#708F96" /></View>;
  }

  if (done) {
    return (
      <View style={styles.center}>
        <CheckCircle2 size={48} color="#22C55E" strokeWidth={1.5} />
        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332', marginTop: 12 }]}>Checklist Complete!</Text>
        <Text style={[styles.subtitle, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
          {checked.size}/{items.length} items checked
        </Text>
      </View>
    );
  }

  const requiredUnchecked = items.filter(i => i.is_required && !checked.has(i.id)).length;

  return (
    <LinearGradient colors={bgGradient} style={styles.container}>
      <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332', padding: 16 }]}>
        {templateTitle ?? 'Checklist'}
      </Text>
      <ScrollView contentContainerStyle={styles.listContent}>
        {items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.itemRow, checked.has(item.id) && styles.itemChecked]}
            onPress={() => toggleItem(item.id)}
            activeOpacity={0.7}
          >
            {checked.has(item.id)
              ? <CheckCircle2 size={22} color="#22C55E" strokeWidth={2} />
              : <Circle size={22} color="rgba(255,255,255,0.4)" strokeWidth={2} />
            }
            <View style={styles.itemText}>
              <Text style={[styles.itemTitle, { color: isDark ? '#F8FAFC' : '#1A2332' }]}>
                {item.title}{item.is_required ? ' *' : ''}
              </Text>
              {item.description ? (
                <Text style={[styles.itemDesc, { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' }]}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        {requiredUnchecked > 0 && (
          <Text style={styles.requiredHint}>{requiredUnchecked} required item{requiredUnchecked > 1 ? 's' : ''} remaining</Text>
        )}
        <TouchableOpacity
          style={[styles.btn, requiredUnchecked > 0 && styles.btnDisabled]}
          onPress={requiredUnchecked > 0 ? undefined : handleComplete}
          activeOpacity={requiredUnchecked > 0 ? 1 : 0.8}
        >
          <LinearGradient colors={requiredUnchecked > 0 ? ['#555', '#444'] as const : ['#22C55E', '#16A34A'] as const} style={styles.gradient}>
            {submitting
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnText}>Mark Complete</Text>
            }
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', padding: 28, alignItems: 'center', gap: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  btn: { width: '100%', borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  gradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  listContent: { padding: 12, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  itemChecked: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemDesc: { fontSize: 12, marginTop: 2 },
  footer: { padding: 16, gap: 8 },
  requiredHint: { fontSize: 12, color: '#FCA5A5', textAlign: 'center' },
});
