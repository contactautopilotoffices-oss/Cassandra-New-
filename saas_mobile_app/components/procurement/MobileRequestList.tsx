import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import SafeBlurView from '@/components/ui/SafeBlurView';
import {
  CheckCircle,
  XCircle,
  ArrowUpCircle,
  Package,
  Clock,
  ChevronRight,
  AlertTriangle,
  DollarSign,
  User,
  Ticket,
  X,
  MessageSquare,
} from 'lucide-react-native';
import {
  type MaterialRequest,
  updateMaterialRequestStatus,
} from '@/utils/api/mobileApi';
import { useTheme } from '@/context';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MobileRequestListProps {
  requests: MaterialRequest[];
  canApprove: boolean;
  canEscalate?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onRequestUpdated?: (id: string) => void;
  emptyMessage?: string;
}

// ─── Status Configuration ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Pending',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pending_quotation:{ label: 'Pending Quote', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pending_approval: { label: 'Needs Approval', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  quoted:           { label: 'Quoted',         color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  approved:         { label: 'Approved',       color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  rejected:         { label: 'Rejected',       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  escalated:        { label: 'Escalated',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  ordered:          { label: 'Ordered',        color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  delivered:        { label: 'Delivered',      color: '#06B6D4', bg: 'rgba(6,182,212,0.12)'  },
  closed:           { label: 'Closed',         color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

// ─── Status Progress Steps ─────────────────────────────────────────────────────
const PROGRESS_STEPS = ['pending_quotation', 'approved', 'ordered', 'delivered'];

function getProgressIndex(status: string): number {
  const idx = PROGRESS_STEPS.indexOf(status);
  if (status === 'pending' || status === 'pending_approval') return 0;
  return idx === -1 ? 0 : idx;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#708F96', bg: 'rgba(112,143,150,0.12)' };
  return (
    <View style={[sBadge.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[sBadge.text, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

const sBadge = StyleSheet.create({
  wrap: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
});

function ProgressBar({ status }: { status: string }) {
  if (status === 'rejected' || status === 'closed') return null;
  const idx = getProgressIndex(status);
  return (
    <View style={sBar.row}>
      {PROGRESS_STEPS.map((step, i) => {
        const done = i <= idx;
        return (
          <React.Fragment key={step}>
            <View style={[sBar.dot, done && sBar.dotDone]} />
            {i < PROGRESS_STEPS.length - 1 && (
              <View style={[sBar.line, i < idx && sBar.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sBar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  dotDone: { backgroundColor: '#10B981', borderColor: '#10B981' },
  line: { flex: 1, height: 1.5, backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 2 },
  lineDone: { backgroundColor: '#10B981' },
});

// ─── Request Card ──────────────────────────────────────────────────────────────
function RequestCard({
  request,
  canApprove,
  canEscalate,
  showPrice,
  onUpdated,
  index,
}: {
  request: MaterialRequest;
  canApprove: boolean;
  canEscalate: boolean;
  showPrice: boolean;
  onUpdated?: (id: string) => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState<'rejected' | 'escalated' | null>(null);
  const [noteText, setNoteText] = useState('');

  const status = request.status;
  const isPending = status === 'pending' || status === 'pending_approval' || status === 'pending_quotation';

  const handleAction = async (action: 'approved' | 'rejected' | 'escalated', notes?: string) => {
    setActionLoading(action);
    try {
      await updateMaterialRequestStatus(request.id, action, notes);
      onUpdated?.(request.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update request');
    } finally {
      setActionLoading(null);
      setShowNoteModal(null);
      setNoteText('');
    }
  };

  const confirmAction = (action: 'rejected' | 'escalated') => {
    setShowNoteModal(action);
  };

  return (
    <>
      <Animated.View entering={FadeInUp.delay(index * 50).duration(450)}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => setExpanded(!expanded)}
          style={sCard.touchable}
        >
          <View style={sCard.card}>
            <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <LinearGradient
              colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.15)']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Top Row */}
            <View style={sCard.topRow}>
              <View style={sCard.iconWrap}>
                <Package size={18} color="#007AFF" strokeWidth={1.8} />
              </View>
              <View style={sCard.topMeta}>
                <Text style={sCard.ticketNum} numberOfLines={1}>
                  {request.ticket?.ticket_number ?? 'REQ-' + request.id.slice(-6).toUpperCase()}
                </Text>
                <Text style={sCard.requester} numberOfLines={1}>
                  {request.requester?.full_name ?? 'Unknown'} · {formatDate(request.created_at)}
                </Text>
              </View>
              <StatusBadge status={status} />
            </View>

            {/* Title */}
            {request.ticket?.title && (
              <Text style={sCard.title} numberOfLines={expanded ? undefined : 2}>
                {request.ticket.title}
              </Text>
            )}

            {/* Progress bar */}
            <ProgressBar status={status} />

            {/* Items Preview */}
            <View style={sCard.itemsWrap}>
              {(request.items || []).slice(0, expanded ? undefined : 2).map((item, i) => (
                <View key={i} style={sCard.itemRow}>
                  <Text style={sCard.itemName} numberOfLines={1}>{item.name}</Text>
                  <View style={sCard.itemRight}>
                    <Text style={sCard.itemQty}>×{item.quantity}</Text>
                    {showPrice && item.unit_price != null && item.unit_price > 0 && (
                      <Text style={sCard.itemPrice}>{formatCurrency(item.unit_price * item.quantity)}</Text>
                    )}
                  </View>
                </View>
              ))}
              {!expanded && (request.items || []).length > 2 && (
                <Text style={sCard.moreItems}>+{(request.items || []).length - 2} more items</Text>
              )}
            </View>

            {/* Total Amount */}
            {showPrice && request.total_amount != null && request.total_amount > 0 && (
              <View style={sCard.totalRow}>
                <DollarSign size={12} color="rgba(255,255,255,0.4)" />
                <Text style={sCard.totalLabel}>Total</Text>
                <Text style={sCard.totalValue}>{formatCurrency(request.total_amount)}</Text>
              </View>
            )}

            {/* Approval Actions (only for pending) */}
            {canApprove && isPending && (
              <View style={sCard.actionsRow}>
                <TouchableOpacity
                  style={[sCard.actionBtn, sCard.rejectBtn]}
                  onPress={() => confirmAction('rejected')}
                  disabled={actionLoading !== null}
                  activeOpacity={0.75}
                >
                  {actionLoading === 'rejected'
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : <><XCircle size={15} color="#EF4444" /><Text style={sCard.rejectText}>Reject</Text></>
                  }
                </TouchableOpacity>

                {canEscalate && (
                  <TouchableOpacity
                    style={[sCard.actionBtn, sCard.escalateBtn]}
                    onPress={() => confirmAction('escalated')}
                    disabled={actionLoading !== null}
                    activeOpacity={0.75}
                  >
                    {actionLoading === 'escalated'
                      ? <ActivityIndicator size="small" color="#8B5CF6" />
                      : <><ArrowUpCircle size={15} color="#8B5CF6" /><Text style={sCard.escalateText}>Escalate</Text></>
                    }
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[sCard.actionBtn, sCard.approveBtn]}
                  onPress={() => handleAction('approved')}
                  disabled={actionLoading !== null}
                  activeOpacity={0.75}
                >
                  {actionLoading === 'approved'
                    ? <ActivityIndicator size="small" color="#10B981" />
                    : <><CheckCircle size={15} color="#10B981" /><Text style={sCard.approveText}>Approve</Text></>
                  }
                </TouchableOpacity>
              </View>
            )}

            {/* Expand chevron */}
            <TouchableOpacity style={sCard.expandBtn} onPress={() => setExpanded(!expanded)}>
              <ChevronRight
                size={14}
                color="rgba(255,255,255,0.3)"
                style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Notes Modal for Reject / Escalate */}
      <Modal visible={showNoteModal !== null} transparent animationType="fade">
        <View style={sModal.overlay}>
          <View style={sModal.sheet}>
            <LinearGradient colors={['#1a2336', '#0f1823']} style={StyleSheet.absoluteFillObject} />
            <View style={sModal.header}>
              <MessageSquare size={18} color={showNoteModal === 'rejected' ? '#EF4444' : '#8B5CF6'} />
              <Text style={sModal.title}>
                {showNoteModal === 'rejected' ? 'Reject Request' : 'Escalate Request'}
              </Text>
              <TouchableOpacity onPress={() => setShowNoteModal(null)}>
                <X size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <Text style={sModal.label}>Add a note (optional)</Text>
            <TextInput
              style={sModal.input}
              placeholder="Reason for rejection / escalation..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              numberOfLines={4}
              value={noteText}
              onChangeText={setNoteText}
            />
            <TouchableOpacity
              style={[sModal.btn, showNoteModal === 'rejected' ? sModal.rejectBtn : sModal.escalateBtn]}
              onPress={() => handleAction(showNoteModal!, noteText.trim() || undefined)}
              disabled={actionLoading !== null}
            >
              {actionLoading !== null
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={sModal.btnText}>
                    {showNoteModal === 'rejected' ? 'Confirm Rejection' : 'Confirm Escalation'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const sCard = StyleSheet.create({
  touchable: { marginBottom: 10 },
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,122,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMeta: { flex: 1 },
  ticketNum: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  requester: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },
  title: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18, marginBottom: 2 },
  itemsWrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  itemPrice: { color: '#10B981', fontSize: 11, fontWeight: '600' },
  moreItems: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  totalLabel: { flex: 1, color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  totalValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 7, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)' },
  rejectText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },
  escalateBtn: { backgroundColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.22)' },
  escalateText: { color: '#8B5CF6', fontSize: 12, fontWeight: '600' },
  approveBtn: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.22)' },
  approveText: { color: '#10B981', fontSize: 12, fontWeight: '600' },
  expandBtn: { alignItems: 'flex-end', marginTop: 4 },
});

const sModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  title: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  label: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 8 },
  rejectBtn: { backgroundColor: '#EF4444' },
  escalateBtn: { backgroundColor: '#8B5CF6' },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

// ─── Main List Export ──────────────────────────────────────────────────────────
export default function MobileRequestList({
  requests,
  canApprove,
  canEscalate = false,
  onRefresh,
  isRefreshing,
  onRequestUpdated,
  emptyMessage = 'No requests found.',
}: MobileRequestListProps) {
  // Price visibility: only show price UI if at least one item has cost data
  const showPrice = useMemo(
    () => requests.some(
      (r) =>
        (r.total_amount ?? 0) > 0 ||
        r.items?.some((i) => (i.unit_price ?? 0) > 0 || (i.total_price ?? 0) > 0)
    ),
    [requests]
  );

  if (requests.length === 0) {
    return (
      <View style={sList.emptyWrap}>
        <Package size={44} color="rgba(255,255,255,0.12)" />
        <Text style={sList.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={(r) => r.id}
      renderItem={({ item, index }) => (
        <RequestCard
          request={item}
          canApprove={canApprove}
          canEscalate={canEscalate}
          showPrice={showPrice}
          onUpdated={onRequestUpdated}
          index={index}
        />
      )}
      contentContainerStyle={sList.content}
      showsVerticalScrollIndicator={false}
    />
  );
}

const sList = StyleSheet.create({
  content: { paddingBottom: 40 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center' },
});
