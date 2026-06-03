import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle, XCircle, AlertTriangle, Package } from 'lucide-react-native';
import { GlassCard } from '@/constants/designSystem';
import { useAuth } from '@/hooks/useAuth';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useTheme } from '@/context';
import {
  listPendingApprovals,
  updateMaterialRequestStatus,
  type MaterialRequest,
} from '@/utils/api/mobileApi';

export default function PendingApprovals() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { user, membership } = useAuth();
  const { theme } = useTheme();
  const { capabilities } = useCapabilities(propertyId);
  const isDark = theme === 'dark';

  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canApprove = capabilities.procurement?.includes('approve');

  const fetchApprovals = useCallback(async () => {
    if (!user?.id || !canApprove) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const orgId = membership?.org_id ?? undefined;
      const data = await listPendingApprovals(user.id, propertyId, orgId);
      // Only show pending_approval status items
      const pending = data.filter(
        (r) => r.status === 'pending_approval' || r.status === 'pending' || r.status === 'pending_quotation'
      );
      setRequests(pending);
    } catch (err: any) {
      console.error('[PendingApprovals] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, propertyId, membership?.org_id, canApprove]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleAction = async (
    requestId: string,
    status: 'approved' | 'rejected'
  ) => {
    setActionLoading(requestId);
    try {
      await updateMaterialRequestStatus(requestId, status);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update request');
    } finally {
      setActionLoading(null);
    }
  };

  if (!canApprove) return null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#708F96" />
      </View>
    );
  }

  if (requests.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Section header with pulse badge */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <AlertTriangle size={16} color="#FF9F0A" strokeWidth={2} />
          <Text
            style={[
              styles.headerTitle,
              { color: isDark ? '#F8FAFC' : '#1A2332' },
            ]}
          >
            Needs Attention
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{requests.length}</Text>
        </View>
      </View>

      {/* Horizontal scroll cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {requests.map((req) => (
          <GlassCard key={req.id} style={styles.card}>
            {/* Card header */}
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Package size={18} color="#708F96" strokeWidth={1.8} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text
                  style={[
                    styles.ticketNumber,
                    { color: isDark ? '#E6EBEE' : '#1D1D1F' },
                  ]}
                  numberOfLines={1}
                >
                  {req.ticket?.ticket_number || 'No Ticket'}
                </Text>
                <Text
                  style={[
                    styles.requesterName,
                    { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' },
                  ]}
                >
                  {req.requester?.full_name || 'Unknown'} ·{' '}
                  {new Date(req.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {/* Items summary */}
            <View style={styles.itemsBox}>
              <Text
                style={[
                  styles.itemsLabel,
                  { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' },
                ]}
              >
                ITEMS
              </Text>
              {(req.items || []).slice(0, 3).map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text
                    style={[
                      styles.itemName,
                      { color: isDark ? '#E6EBEE' : '#1D1D1F' },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.itemQty,
                      { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' },
                    ]}
                  >
                    ×{item.quantity}
                  </Text>
                </View>
              ))}
              {(req.items || []).length > 3 && (
                <Text
                  style={[
                    styles.moreText,
                    { color: isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)' },
                  ]}
                >
                  +{(req.items || []).length - 3} more
                </Text>
              )}
            </View>

            {/* Total */}
            {req.total_amount !== null && req.total_amount !== undefined && (
              <View style={styles.totalRow}>
                <Text
                  style={[
                    styles.totalLabel,
                    { color: isDark ? 'rgba(230,235,238,0.5)' : 'rgba(26,35,50,0.5)' },
                  ]}
                >
                  Total
                </Text>
                <Text
                  style={[
                    styles.totalValue,
                    { color: isDark ? '#F8FAFC' : '#1A2332' },
                  ]}
                >
                  ₹{req.total_amount.toLocaleString()}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleAction(req.id, 'rejected')}
                disabled={actionLoading === req.id}
                activeOpacity={0.7}
              >
                {actionLoading === req.id ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <XCircle size={16} color="#EF4444" strokeWidth={2} />
                    <Text style={styles.rejectText}>Reject</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleAction(req.id, 'approved')}
                disabled={actionLoading === req.id}
                activeOpacity={0.7}
              >
                {actionLoading === req.id ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <>
                    <CheckCircle size={16} color="#10B981" strokeWidth={2} />
                    <Text style={styles.approveText}>Approve</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </GlassCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    backgroundColor: '#FF9F0A',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingRight: 24,
    gap: 12,
  },
  card: {
    width: 280,
    padding: 16,
    marginRight: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(112,143,150,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  ticketNumber: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    fontWeight: '600',
  },
  requesterName: {
    fontFamily: 'Urbanist-Regular',
    fontSize: 11,
    marginTop: 1,
  },
  itemsBox: {
    backgroundColor: 'rgba(112,143,150,0.06)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  itemsLabel: {
    fontFamily: 'Poppins-Bold',
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  itemName: {
    fontFamily: 'Urbanist-Medium',
    fontSize: 12,
    flex: 1,
  },
  itemQty: {
    fontFamily: 'Urbanist-Regular',
    fontSize: 11,
  },
  moreText: {
    fontFamily: 'Urbanist-Regular',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(112,143,150,0.1)',
  },
  totalLabel: {
    fontFamily: 'Urbanist-Regular',
    fontSize: 12,
  },
  totalValue: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  rejectText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  approveBtn: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.2)',
  },
  approveText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
});
