import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useWeather } from "@/hooks/useWeather";
import { useTenantTickets } from "@/hooks/tenant/useTenantTickets";
import WeatherBackground from "@/components/dashboard/WeatherBackground";
import TenantBottomNav from "@/components/tenant/TenantBottomNav";
import { TenantTicketCard } from "@/components/tenant/TenantTicketCard";
import { TicketCreateModal } from "@/components/tickets/TicketCreateModal";
import { SPACING } from "@/constants/designSystem";

const FONT_DISPLAY = Platform.select({
  web: "Poppins, -apple-system, BlinkMacSystemFont, sans-serif",
  ios: "Poppins",
  android: "Poppins",
  default: "Poppins",
});
const FONT_BODY = Platform.select({
  web: "Urbanist, -apple-system, BlinkMacSystemFont, sans-serif",
  ios: "Urbanist",
  android: "Urbanist",
  default: "Urbanist",
});

type FilterStatus = "all" | "open" | "in_progress" | "resolved";

export default function TenantRequestsPage() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const insets = useSafeAreaInsets();
  const { user, membership } = useAuth();
  const { weather } = useWeather();

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [showTicketModal, setShowTicketModal] = useState(false);

  const { tickets, loading, refetch } = useTenantTickets(propertyId, user?.id);

  const filteredTickets = React.useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t: any) => {
      if (filter === "open")
        return t.status === "open" || t.status === "assigned";
      if (filter === "in_progress") return t.status === "in_progress";
      if (filter === "resolved")
        return t.status === "resolved" || t.status === "closed";
      return true;
    });
  }, [tickets, filter]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleTicketCreated = () => {
    setShowTicketModal(false);
    refetch();
  };

  const filters: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#1a1a1a", "#121212", "#0a0a0a"]}
        style={StyleSheet.absoluteFillObject}
      />
      {weather && <WeatherBackground condition={weather.condition} />}

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Requests</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setShowTicketModal(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChips}
        >
          {filters.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                filter === f.key && styles.filterChipActive,
              ]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === f.key && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlashList
        data={filteredTickets}
        keyExtractor={(item: any) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.6)"
          />
        }
        contentContainerStyle={{
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={160}
        renderItem={({ item }) => (
          <TenantTicketCard
            ticket={item}
            onPress={() =>
              router.push(`/property/${propertyId}/tickets/${item.id}` as any)
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="ticket-outline"
              size={48}
              color="rgba(255,255,255,0.2)"
            />
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap + to raise your first ticket
            </Text>
          </View>
        }
      />

      <TenantBottomNav />

      <TicketCreateModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        propertyId={propertyId}
        organizationId={membership?.org_id ?? ""}
        role="tenant"
        onSuccess={handleTicketCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    marginBottom: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterRow: {
    marginBottom: 16,
  },
  filterChips: {
    paddingHorizontal: SPACING.xl,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterChipActive: {
    backgroundColor: "#708F96",
    borderColor: "#708F96",
  },
  filterChipText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  filterChipTextActive: {
    fontFamily: FONT_BODY,
    color: "#FFFFFF",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    marginTop: 6,
  },
});
