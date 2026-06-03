import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { FlashList } from "@shopify/flash-list";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useAuth } from "@/context";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase/client";
import { electricityService } from "@/services/electricityService";
import { serverApi } from "@/lib/serverApi";

import { LoggersMenu } from "@/components/shared/LoggersMenu";
import SafeBlurView from "@/components/ui/SafeBlurView";
import { LinearGradient } from "expo-linear-gradient";
import {
  Zap,
  ChevronDown,
  X,
  Clock,
  TrendingUp,
  Trash2,
  CalendarDays,
} from "lucide-react-native";
import { Calendar } from "react-native-calendars";
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElectricityMeter {
  id: string;
  name: string;
  meter_number?: string;
  meter_type?: string;
  max_load_kw?: number;
  status: string;
  last_reading?: number;
}

interface ElectricityReading {
  id: string;
  meter_id: string;
  opening_reading: number;
  closing_reading: number;
  computed_units?: number;
  final_units?: number;
  multiplier_value?: number;
  notes?: string;
  reading_date?: string;
  created_at: string;
}

interface GridTariff {
  id: string;
  rate_per_unit: number;
  utility_provider?: string;
  effective_from?: string;
  effective_to?: string | null;
}

// ─── Period Selector ──────────────────────────────────────────────────────────

type Period = "today" | "week" | "month";

const PERIODS: { label: string; value: Period }[] = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function getPeriodDates(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  let start: string;
  if (period === "today") {
    start = end;
  } else if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = d.toISOString().split("T")[0];
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    start = d.toISOString().split("T")[0];
  }
  return { start, end };
}

// ─── Custom Date Picker ─────────────────────────────────────────────────────

function CustomDatePicker({
  visible,
  selectedDate,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const [viewYear, setViewYear] = useState(() =>
    new Date(selectedDate + "T00:00:00").getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(() =>
    new Date(selectedDate + "T00:00:00").getMonth(),
  );

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const today = new Date().toISOString().split("T")[0];

  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();
  const getFirstDayOfWeek = (year: number, month: number) =>
    new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  if (!visible) return null;

  return (
    <View
      style={[
        styles.customDatePickerContainer,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {/* Header */}
      <View style={styles.customDateHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.customDateNavBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.customDateTitle, { color: colors.text }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.customDateNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      {/* Day headers */}
      <View style={styles.customDateGrid}>
        {DAYS.map((d) => (
          <View key={d} style={styles.customDateCell}>
            <Text
              style={[
                styles.customDateDayLabel,
                { color: colors.textTertiary },
              ]}
            >
              {d}
            </Text>
          </View>
        ))}
        {cells.map((date, idx) => {
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <View key={idx} style={styles.customDateCell}>
              {date ? (
                <TouchableOpacity
                  style={[
                    styles.customDateDayBtn,
                    isSelected && { backgroundColor: colors.primary },
                    isToday &&
                      !isSelected && {
                        borderWidth: 1,
                        borderColor: colors.primary,
                      },
                  ]}
                  onPress={() => {
                    onSelect(date);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.customDateDayText,
                      { color: isSelected ? "#FFF" : colors.text },
                    ]}
                  >
                    {parseInt(date.split("-")[2])}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
      {/* Cancel */}
      <TouchableOpacity
        style={{ alignItems: "center", paddingVertical: 10 }}
        onPress={onClose}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: "Urbanist-Medium",
            fontSize: 13,
          }}
        >
          Cancel
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Meter Card ───────────────────────────────────────────────────────────────

const MeterCard = React.memo(function MeterCard({
  meter,
  latestReading,
  units,
  cost,
  tariffRate,
  colors,
  onPress,
}: {
  meter: ElectricityMeter;
  latestReading: ElectricityReading | null;
  units: number;
  cost: number;
  tariffRate: number;
  colors: typeof Colors.light;
  onPress?: () => void;
}) {
  const isLive = meter.status === "active";
  const statusColor = isLive ? "#10B981" : "#EF4444";
  const statusLabel = isLive ? "Live" : "Idle";

  // Compute energy percentage against a reasonable max scale (e.g. 5000 units, or dynamic relative scale)
  const maxScale = 5000;
  const pct = Math.min(100, Math.max(0, (units / maxScale) * 100));

  const lastReadingTime = latestReading?.created_at
    ? formatRelative(latestReading.created_at)
    : "No reading yet";

  // Format dynamic numbers nicely
  const formattedUnits = units.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress}>
      <View
        style={[
          styles.meterCard,
          {
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.meterCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.meterCardName, { color: colors.text }]}>
              {meter.name}
            </Text>
            <Text
              style={[
                styles.meterCardMeta,
                { color: "rgba(255, 255, 255, 0.4)" },
              ]}
            >
              {meter.meter_type === "main"
                ? "Main Grid"
                : meter.meter_type || "Meter"}{" "}
              - {meter.meter_number || "No #"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={[
                styles.meterStatusBadge,
                {
                  backgroundColor: isLive
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(239, 68, 68, 0.12)",
                },
              ]}
            >
              <View
                style={[
                  styles.meterStatusDot,
                  { backgroundColor: statusColor },
                ]}
              />
              <Text style={[styles.meterStatusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <Ionicons
              name="open-outline"
              size={18}
              color="rgba(255, 255, 255, 0.5)"
            />
          </View>
        </View>

        <View style={styles.genCardFuel}>
          <View style={styles.genCardFuelHeader}>
            <Ionicons
              name="flash-outline"
              size={14}
              color="rgba(255, 255, 255, 0.6)"
            />
            <Text
              style={[
                styles.genCardFuelLabel,
                { color: "rgba(255, 255, 255, 0.5)" },
              ]}
            >
              Energy Consumed
            </Text>
          </View>

          {/* gradient progress bar */}
          <View
            style={[
              styles.gaugeTrack,
              {
                height: 8,
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                borderRadius: 4,
                overflow: "hidden",
                marginVertical: 8,
              },
            ]}
          >
            {pct > 0 && (
              <LinearGradient
                colors={["#8B5CF6", "#3B82F6", "#10B981"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: `${pct}%`, height: "100%", borderRadius: 4 }}
              />
            )}
          </View>

          <Text
            style={[
              styles.gaugeLabel,
              {
                color: "rgba(255, 255, 255, 0.5)",
                fontSize: 13,
                fontFamily: "Urbanist-Medium",
              },
            ]}
          >
            {formattedUnits} kVAh / {maxScale.toLocaleString()}
          </Text>
        </View>

        {/* Cost Estimation Panel */}
        <View
          style={[
            styles.costRow,
            {
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderRadius: 10,
              padding: 10,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.05)",
            },
          ]}
        >
          <View style={styles.costItem}>
            <Text
              style={[styles.costLabel, { color: "rgba(255, 255, 255, 0.4)" }]}
            >
              Tariff Rate
            </Text>
            <Text style={[styles.costValue, { color: "#FFFFFF" }]}>
              {tariffRate > 0 ? `₹${tariffRate.toFixed(2)}` : "N/A"}
            </Text>
          </View>
          <View style={styles.costItem}>
            <Text
              style={[styles.costLabel, { color: "rgba(255, 255, 255, 0.4)" }]}
            >
              Est. Cost
            </Text>
            <Text style={[styles.costValue, { color: "#10B981" }]}>
              {cost > 0 ? `₹${cost.toFixed(2)}` : "-"}
            </Text>
          </View>
        </View>

        <View style={styles.genCardFooter}>
          <View style={styles.genCardFooterItem}>
            <Ionicons
              name="time-outline"
              size={14}
              color="rgba(255, 255, 255, 0.4)"
            />
            <Text
              style={[
                styles.genCardFooterText,
                {
                  color: "rgba(255, 255, 255, 0.4)",
                  fontFamily: "Urbanist-Medium",
                },
              ]}
            >
              {lastReadingTime}
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          {/* arrow indicators */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons
              name="arrow-forward-outline"
              size={12}
              color="rgba(255, 255, 255, 0.2)"
            />
            <Ionicons
              name="pulse-outline"
              size={12}
              color="rgba(255, 255, 255, 0.2)"
            />
            <Ionicons
              name="stats-chart-outline"
              size={12}
              color="rgba(255, 255, 255, 0.2)"
            />
            <Ionicons
              name="arrow-forward-outline"
              size={12}
              color="rgba(255, 255, 255, 0.2)"
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Log Reading Modal ──────────────────────────────────────────────────────

function LogReadingModal({
  visible,
  onClose,
  meters,
  propertyId,
  colors,
  onSuccess,
  initialMeterId,
  readings,
}: {
  visible: boolean;
  onClose: () => void;
  meters: ElectricityMeter[];
  propertyId: string;
  colors: typeof Colors.light;
  onSuccess: () => void;
  initialMeterId?: string | null;
  readings: ElectricityReading[];
}) {
  const [selectedMeterId, setSelectedMeterId] = useState<string>("");
  const [closingReading, setClosingReading] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMeterPicker, setShowMeterPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [readingDate, setReadingDate] = useState<string>(today);

  const selectedMeter = meters.find((m) => m.id === selectedMeterId);

  // Derive opening and ceiling from parent readings — no separate Supabase query, no race condition
  const { opening, ceiling } = useMemo(() => {
    if (!selectedMeterId) return { opening: 0, ceiling: null as number | null };
    const meterReadings = readings
      .filter((r) => r.meter_id === selectedMeterId)
      .sort((a, b) => {
        const dateA = a.reading_date || "";
        const dateB = b.reading_date || "";
        if (dateA !== dateB) return dateA < dateB ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      });

    // Opening: most recent reading BEFORE selected date → its closing
    const before = meterReadings.find(
      (r) => (r.reading_date || "") < readingDate,
    );
    const after = meterReadings.find(
      (r) => (r.reading_date || "") > readingDate,
    );

    const openVal = before?.closing_reading ?? selectedMeter?.last_reading ?? 0;
    const ceilVal = after?.closing_reading ?? null;

    return { opening: openVal, ceiling: ceilVal };
  }, [selectedMeterId, readings, readingDate, selectedMeter]);

  const units = (() => {
    const c = parseFloat(closingReading);
    if (isNaN(c) || !closingReading) return null;
    return Math.max(0, c - opening);
  })();

  // Date options for picker
  const dateOptions = [
    { label: "Today", value: today },
    {
      label: "Yesterday",
      value: new Date(Date.now() - 86400000).toISOString().split("T")[0],
    },
    {
      label: "2 days ago",
      value: new Date(Date.now() - 172800000).toISOString().split("T")[0],
    },
    { label: "Custom...", value: "__custom__" },
  ];

  // Reset form when modal opens with fresh meters
  useEffect(() => {
    if (visible && meters.length > 0) {
      if (initialMeterId) {
        setSelectedMeterId(initialMeterId);
      } else if (
        !selectedMeterId ||
        !meters.find((m) => m.id === selectedMeterId)
      ) {
        setSelectedMeterId(meters[0].id);
      }
    }
  }, [visible, meters, initialMeterId]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setClosingReading("");
      setNotes("");
      setShowMeterPicker(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!selectedMeterId || !closingReading) {
      Alert.alert("Missing Fields", "Please enter a meter reading.");
      return;
    }
    const c = parseFloat(closingReading);
    // Only enforce closing > opening for today's entry — past readings can be lower
    // (meter reset, correction, manual adjustment). For past dates, only ceiling applies.
    if (readingDate === today && c <= opening) {
      Alert.alert(
        "Invalid Reading",
        `Closing reading must be greater than opening reading (${opening.toFixed(2)}).`,
      );
      return;
    }
    if (ceiling !== null && c > ceiling) {
      Alert.alert(
        "Invalid Reading",
        `Reading cannot be greater than a future reading recorded (${ceiling.toFixed(2)}). To record this, you must first correct or delete future entries.`,
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await electricityService.submitReading(propertyId, {
        meter_id: selectedMeterId,
        reading_date: readingDate,
        opening_reading: opening,
        closing_reading: c,
        notes: notes || null,
      });

      if (!res.success) throw new Error(String(res.error || 'Failed to save reading'));

      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save reading");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[styles.sheetContent, { backgroundColor: colors.card }]}>
            <View
              style={[
                styles.sheetHeaderRow,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Log Electricity Reading
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Meter Picker */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Meter
              </Text>
              <TouchableOpacity
                style={[
                  styles.picker,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setShowMeterPicker(!showMeterPicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>
                  {selectedMeter?.name ?? "Select Meter"}
                </Text>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showMeterPicker && (
                <View
                  style={[
                    styles.pickerDropdown,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {meters.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.pickerOption,
                        m.id === selectedMeterId && {
                          backgroundColor: colors.primaryLight,
                        },
                      ]}
                      onPress={() => {
                        setSelectedMeterId(m.id);
                        setShowMeterPicker(false);
                        setClosingReading("");
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: colors.text },
                        ]}
                      >
                        {m.name}
                      </Text>
                      <Text
                        style={[
                          styles.pickerOptionSub,
                          { color: colors.textTertiary },
                        ]}
                      >
                        {m.meter_number || m.meter_type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Date Picker */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Reading Date
              </Text>
              <TouchableOpacity
                style={[
                  styles.picker,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Clock size={16} color={colors.textSecondary} />
                  <Text style={[styles.pickerText, { color: colors.text }]}>
                    {readingDate === today
                      ? "Today"
                      : readingDate ===
                          new Date(Date.now() - 86400000)
                            .toISOString()
                            .split("T")[0]
                        ? "Yesterday"
                        : readingDate ===
                            new Date(Date.now() - 172800000)
                              .toISOString()
                              .split("T")[0]
                          ? "2 days ago"
                          : new Date(
                              readingDate + "T00:00:00",
                            ).toLocaleDateString("en-US", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                  </Text>
                </View>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showDatePicker && (
                <View
                  style={[
                    styles.pickerDropdown,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {dateOptions.map((opt) =>
                    opt.value === "__custom__" ? (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.pickerOption,
                          { borderTopWidth: 1, borderTopColor: colors.border },
                        ]}
                        onPress={() => {
                          setShowDatePicker(false);
                          setShowCustomDatePicker(true);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            { color: colors.text },
                          ]}
                        >
                          Custom Date...
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.pickerOption,
                          opt.value === readingDate && {
                            backgroundColor: colors.primaryLight,
                          },
                        ]}
                        onPress={() => {
                          setReadingDate(opt.value);
                          setShowDatePicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            { color: colors.text },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              )}

              {/* Opening info */}
              <View
                style={[
                  styles.openingInfo,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.openingItem}>
                  <Text
                    style={[
                      styles.openingLabel,
                      { color: colors.textTertiary },
                    ]}
                  >
                    Opening Reading
                  </Text>
                  <Text style={[styles.openingValue, { color: colors.text }]}>
                    {opening.toFixed(2)} kVAh
                  </Text>
                </View>
              </View>

              {/* Reading Input */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Current Reading (kVAh)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={closingReading}
                onChangeText={setClosingReading}
                placeholder="Enter meter reading"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* Units Preview */}
              {units !== null && (
                <View
                  style={[
                    styles.unitsPreview,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <TrendingUp size={14} color={colors.primary} />
                  <Text
                    style={[styles.unitsPreviewText, { color: colors.primary }]}
                  >
                    Units consumed: {units.toFixed(2)} kVAh
                  </Text>
                </View>
              )}

              {/* Notes */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Notes (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.notesInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any observations..."
                placeholderTextColor={colors.textTertiary}
                multiline
              />

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                  (isSubmitting || !closingReading) && { opacity: 0.5 },
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting || !closingReading}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Reading</Text>
                )}
              </TouchableOpacity>

              {/* Custom Date Picker */}
              <CustomDatePicker
                visible={showCustomDatePicker}
                selectedDate={readingDate}
                onSelect={(date) => {
                  setReadingDate(date);
                  setShowCustomDatePicker(false);
                }}
                onClose={() => setShowCustomDatePicker(false)}
                colors={colors}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Recent Readings ──────────────────────────────────────────────────────────

function RecentReadingsList({
  readings,
  meters,
  colors,
  onDelete,
  deletingId,
}: {
  readings: ElectricityReading[];
  meters: ElectricityMeter[];
  colors: typeof Colors.light;
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}) {
  const meterMap = useMemo(() => {
    const m: Record<string, string> = {};
    meters.forEach((mt) => {
      m[mt.id] = mt.name;
    });
    return m;
  }, [meters]);

  if (readings.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <Text style={[styles.recentSectionTitle, { color: colors.text }]}>
        Recent Readings
      </Text>
      {readings.slice(0, 10).map((r) => {
        const units = r.final_units ?? r.computed_units ?? 0;
        return (
          <View
            key={r.id}
            style={[styles.readingRow, { borderColor: colors.border }]}
          >
            <View style={styles.readingRowLeft}>
              <Text style={[styles.readingGenName, { color: colors.text }]}>
                {meterMap[r.meter_id] ?? "Unknown Meter"}
              </Text>
              <Text
                style={[styles.readingTime, { color: colors.textTertiary }]}
              >
                {r.reading_date
                  ? new Date(r.reading_date + "T00:00:00").toLocaleDateString(
                      "en-US",
                      { day: "2-digit", month: "short", year: "numeric" },
                    )
                  : "—"}{" "}
                · {formatRelative(r.created_at)}
              </Text>
            </View>
            <View style={styles.readingRowRight}>
              <Text
                style={[styles.recentReadingValue, { color: colors.primary }]}
              >
                {units.toFixed(1)} kVAh
              </Text>
              <Text style={[styles.readingSub, { color: colors.textTertiary }]}>
                {r.closing_reading.toFixed(0)}
              </Text>
            </View>
            {onDelete && (
              <TouchableOpacity
                style={{ padding: 4, marginLeft: 8 }}
                onPress={() => onDelete(r.id)}
                disabled={deletingId === r.id}
              >
                {deletingId === r.id ? (
                  <ActivityIndicator size={14} color="#EF4444" />
                ) : (
                  <Trash2 size={16} color="#EF4444" />
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Tariff Modal ────────────────────────────────────────────────────────────

interface TariffModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  colors: any;
  onTariffChange: () => void;
}

interface StoredTariff {
  id: string;
  rate_per_unit: number;
  utility_provider?: string;
  effective_from: string;
  effective_to?: string | null;
  created_at?: string;
}

function TariffModal({
  visible,
  onClose,
  propertyId,
  colors,
  onTariffChange,
}: TariffModalProps) {
  const { user: authUser } = useAuth();
  const [rate, setRate] = useState("");
  const [provider, setProvider] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [tariffs, setTariffs] = useState<StoredTariff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchTariffs = async () => {
    setIsLoading(true);
    try {
      const { data, error: fetchErr } = (await supabase
        .from("grid_tariffs")
        .select("*")
        .eq("property_id", propertyId)
        .order("effective_from", { ascending: false })) as any;

      if (fetchErr) throw fetchErr;
      setTariffs(data || []);
    } catch (e: any) {
      console.error("Error fetching tariffs:", e);
      Alert.alert("Error", "Failed to load tariffs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) fetchTariffs();
  }, [visible]);

  const handleSubmit = async () => {
    if (!rate) {
      setError("Rate is required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const rateVal = parseFloat(rate);
      const res = await electricityService.createTariff({
        property_id: propertyId,
        rate_per_unit: rateVal,
        utility_provider: provider || null,
        unit_type: 'kVAh',
        effective_from: effectiveFrom,
        created_by: authUser?.id,
      });
      if (!res.success) throw new Error(String(res.error || 'Failed to save tariff'));

      setRate("");
      setProvider("");
      await fetchTariffs();
      await onTariffChange();
    } catch (e: any) {
      setError(e.message || "Failed to save tariff");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      "Delete Tariff",
      "Are you sure? This will clear cost calculations for readings in this period.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(id);
            try {
              const delRes = await electricityService.deleteTariff(id, propertyId);
              if (!delRes.success) throw new Error(String(delRes.error || 'Could not delete tariff'));

              await fetchTariffs();
              await onTariffChange();
            } catch (e: any) {
              Alert.alert(
                "Delete Failed",
                e.message || "Could not delete tariff",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.tariffModalContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View
          style={[
            styles.tariffModalHeader,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Zap size={20} color={colors.primary} />
            <Text style={[styles.tariffModalTitle, { color: colors.text }]}>
              Grid Tariff
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* Add Tariff Form */}
          <View
            style={[
              styles.tariffForm,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.tariffFormTitle, { color: colors.text }]}>
              Update Tariff Rate
            </Text>
            {error && (
              <View style={styles.tariffError}>
                <Text style={styles.tariffErrorText}>{error}</Text>
              </View>
            )}
            <Text
              style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
            >
              Rate per kVAh
            </Text>
            <TextInput
              style={[
                styles.tariffInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={rate}
              onChangeText={setRate}
              placeholder="e.g. 8.50"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />
            <Text
              style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
            >
              Utility Provider (Optional)
            </Text>
            <TextInput
              style={[
                styles.tariffInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={provider}
              onChangeText={setProvider}
              placeholder="e.g. Tata Power"
              placeholderTextColor={colors.textTertiary}
            />
            <Text
              style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
            >
              Effective From
            </Text>
            <TouchableOpacity
              style={[
                styles.tariffInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text
                style={{
                  color: colors.text,
                  fontFamily: "Urbanist-Regular",
                  fontSize: 15,
                }}
              >
                {new Date(effectiveFrom + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { day: "2-digit", month: "long", year: "numeric" },
                )}
              </Text>
              <CalendarDays size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tariffSubmitBtn,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !rate}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.tariffSubmitBtnText}>Update Rate</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Tariff History */}
          <Text style={[styles.tariffHistoryTitle, { color: colors.text }]}>
            Tariff History
          </Text>
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : tariffs.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Zap size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                No tariffs configured
              </Text>
            </View>
          ) : (
            tariffs.map((tariff, idx) => {
              const isActive =
                !tariff.effective_to && tariff.effective_from <= today;
              return (
                <View
                  key={tariff.id}
                  style={[
                    styles.tariffHistoryRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={[styles.tariffRateText, { color: colors.text }]}
                      >
                        ₹{tariff.rate_per_unit.toFixed(2)}
                      </Text>
                      {isActive && (
                        <View
                          style={[
                            styles.tariffActiveBadge,
                            { backgroundColor: "#10B981" },
                          ]}
                        >
                          <Text style={styles.tariffActiveBadgeText}>
                            Active
                          </Text>
                        </View>
                      )}
                    </View>
                    {tariff.utility_provider && (
                      <Text
                        style={[
                          styles.tariffProvider,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {tariff.utility_provider}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.tariffDateRange,
                        { color: colors.textTertiary },
                      ]}
                    >
                      From:{" "}
                      {new Date(tariff.effective_from).toLocaleDateString(
                        "en-US",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                      {tariff.effective_to
                        ? ` · To: ${new Date(tariff.effective_to).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}`
                        : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ padding: 8 }}
                    onPress={() => handleDelete(tariff.id)}
                    disabled={deletingId === tariff.id}
                  >
                    {deletingId === tariff.id ? (
                      <ActivityIndicator size={16} color="#EF4444" />
                    ) : (
                      <Trash2 size={16} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Calendar Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.calendarModalContent,
              { backgroundColor: colors.card },
            ]}
          >
            <View
              style={[
                styles.calendarModalHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={[styles.calendarModalTitle, { color: colors.text }]}>
                Select Date
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Calendar
              current={effectiveFrom}
              onDayPress={(day: any) => {
                setEffectiveFrom(day.dateString);
                setShowDatePicker(false);
              }}
              markedDates={{
                [effectiveFrom]: {
                  selected: true,
                  selectedColor: colors.primary,
                },
              }}
              theme={{
                backgroundColor: colors.card,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: colors.primary,
                selectedDayTextColor: "#ffffff",
                todayTextColor: colors.primary,
                dayTextColor: colors.text,
                textDisabledColor: colors.textTertiary,
                arrowColor: colors.primary,
                monthTextColor: colors.text,
                textMonthFontFamily: "Poppins-Bold",
                textDayFontFamily: "Urbanist-Regular",
              }}
              style={{ borderRadius: 12 }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

// ─── Meter Config Modal ──────────────────────────────────────────────────────

interface MeterConfigModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  colors: any;
  onSuccess: () => void;
}

const METER_TYPES = [
  { label: "Main Grid", value: "main" },
  { label: "Generator", value: "generator" },
  { label: "Solar", value: "solar" },
  { label: "Sub Meter", value: "sub" },
];

function MeterConfigModal({
  visible,
  onClose,
  propertyId,
  colors,
  onSuccess,
}: MeterConfigModalProps) {
  const { user: authUser } = useAuth();
  const [name, setName] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [meterType, setMeterType] = useState("main");
  const [lastReading, setLastReading] = useState("0");
  const [ctPrimary, setCtPrimary] = useState("200");
  const [ctSecondary, setCtSecondary] = useState("5");
  const [ptPrimary, setPtPrimary] = useState("11000");
  const [ptSecondary, setPtSecondary] = useState("110");
  const [meterConstant, setMeterConstant] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMultiplier, setShowMultiplier] = useState(false);

  const computedMultiplier = () => {
    const cP = parseFloat(ctPrimary) || 0;
    const cS = parseFloat(ctSecondary) || 1;
    const pP = parseFloat(ptPrimary) || 0;
    const pS = parseFloat(ptSecondary) || 1;
    const mC = parseFloat(meterConstant) || 0;
    const ct = cP / (cS || 1);
    const pt = pP / (pS || 1);
    return ct * pt * mC;
  };

  useEffect(() => {
    if (!visible) {
      setName("");
      setMeterNumber("");
      setMeterType("main");
      setLastReading("0");
      setCtPrimary("200");
      setCtSecondary("5");
      setPtPrimary("11000");
      setPtSecondary("110");
      setMeterConstant("1");
      setError(null);
      setShowMultiplier(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Meter name is required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const multValue = computedMultiplier();
      const res = await electricityService.createMeter({
        property_id: propertyId,
        name: name.trim(),
        meter_number: meterNumber.trim() || null,
        meter_type: meterType,
        last_reading: parseFloat(lastReading) || 0,
        status: 'active',
        initial_multiplier: {
          ct_ratio_primary: parseFloat(ctPrimary) || 0,
          ct_ratio_secondary: parseFloat(ctSecondary) || 0,
          pt_ratio_primary: parseFloat(ptPrimary) || 0,
          pt_ratio_secondary: parseFloat(ptSecondary) || 0,
          meter_constant: parseFloat(meterConstant) || 0,
          multiplier_value: multValue,
          effective_from: new Date().toISOString().split("T")[0],
          created_by: authUser?.id,
        },
        } as any);
      if (!res.success)
        console.error(
          "[MeterConfig] Meter creation failed:",
          String(res.error || 'Unknown error'),
        );
      else await onSuccess();
    } catch (e: any) {
      setError(e.message || "Failed to add meter");
    } finally {
      setIsSubmitting(false);
    }
  };

  const numInput = (val: string, setter: (v: string) => void) => (
    <TextInput
      style={[
        styles.tariffInput,
        {
          backgroundColor: colors.background,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
      value={val}
      onChangeText={setter}
      placeholder="0"
      placeholderTextColor={colors.textTertiary}
      keyboardType="numeric"
    />
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.tariffModalContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View
          style={[
            styles.tariffModalHeader,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Zap size={20} color={colors.primary} />
            <Text style={[styles.tariffModalTitle, { color: colors.text }]}>
              Add Meter
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {error && (
            <View style={[styles.tariffError, { marginBottom: 12 }]}>
              <Text style={styles.tariffErrorText}>{error}</Text>
            </View>
          )}

          {/* Basic Info */}
          <Text
            style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
          >
            Meter Name *
          </Text>
          <TextInput
            style={[
              styles.tariffInput,
              {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Main Grid Meter"
            placeholderTextColor={colors.textTertiary}
          />
          <Text
            style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
          >
            Meter Number (Optional)
          </Text>
          <TextInput
            style={[
              styles.tariffInput,
              {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            value={meterNumber}
            onChangeText={setMeterNumber}
            placeholder="e.g. MTR-001"
            placeholderTextColor={colors.textTertiary}
          />
          <Text
            style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
          >
            Meter Type
          </Text>
          <View style={styles.meterTypeRow}>
            {METER_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.meterTypeBtn,
                  meterType === t.value && { backgroundColor: colors.primary },
                ]}
                onPress={() => setMeterType(t.value)}
              >
                <Text
                  style={[
                    styles.meterTypeBtnText,
                    meterType === t.value && { color: "#FFF" },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text
            style={[styles.tariffFieldLabel, { color: colors.textSecondary }]}
          >
            Starting Reading
          </Text>
          {numInput(lastReading, setLastReading)}

          {/* Multiplier Toggle */}
          <TouchableOpacity
            style={[
              styles.tariffForm,
              {
                marginTop: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setShowMultiplier(!showMultiplier)}
          >
            <View>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Poppins-Bold",
                  color: colors.text,
                }}
              >
                CT/PT Multiplier
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginTop: 2,
                }}
              >
                Current: {computedMultiplier().toFixed(0)}x
              </Text>
            </View>
            <Ionicons
              name={showMultiplier ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {showMultiplier && (
            <View
              style={[
                styles.tariffForm,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  marginTop: 8,
                },
              ]}
            >
              <View style={styles.multiplierGrid}>
                <View style={styles.multiplierField}>
                  <Text
                    style={[
                      styles.tariffFieldLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    CT Primary
                  </Text>
                  {numInput(ctPrimary, setCtPrimary)}
                </View>
                <View style={styles.multiplierField}>
                  <Text
                    style={[
                      styles.tariffFieldLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    CT Secondary
                  </Text>
                  {numInput(ctSecondary, setCtSecondary)}
                </View>
                <View style={styles.multiplierField}>
                  <Text
                    style={[
                      styles.tariffFieldLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    PT Primary
                  </Text>
                  {numInput(ptPrimary, setPtPrimary)}
                </View>
                <View style={styles.multiplierField}>
                  <Text
                    style={[
                      styles.tariffFieldLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    PT Secondary
                  </Text>
                  {numInput(ptSecondary, setPtSecondary)}
                </View>
              </View>
              <Text
                style={[
                  styles.tariffFieldLabel,
                  { color: colors.textSecondary },
                ]}
              >
                Meter Constant
              </Text>
              {numInput(meterConstant, setMeterConstant)}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.tariffSubmitBtn,
              { backgroundColor: colors.primary, marginTop: 20 },
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.tariffSubmitBtnText}>Add Meter</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ElectricityScreen() {
  const { propertyId, mode } = useLocalSearchParams<{
    propertyId: string;
    mode?: string;
  }>();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user: authUser } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [meters, setMeters] = useState<ElectricityMeter[]>([]);

  const [readings, setReadings] = useState<ElectricityReading[]>([]);
  const [previousClosings, setPreviousClosings] = useState<
    Record<string, number>
  >({});
  const [activeTariff, setActiveTariff] = useState<GridTariff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [showSheet, setShowSheet] = useState(false);
  const [showLoggersMenu, setShowLoggersMenu] = useState(false);
  const [selectedMeterForLogging, setSelectedMeterForLogging] = useState<
    string | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReadings, setHistoryReadings] = useState<ElectricityReading[]>(
    [],
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [showMeterModal, setShowMeterModal] = useState(false);

  const handleDeleteReading = async (id: string) => {
    Alert.alert(
      "Delete Reading",
      "Are you sure you want to delete this reading entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(id);
            try {
              const reading = readings.find((r) => r.id === id);
              if (!reading) throw new Error("Reading not found");

              const delRes = await electricityService.deleteReading(id, reading.meter_id, propertyId as string);
              if (!delRes.success) throw new Error(String(delRes.error || 'Could not delete reading'));

              await fetchData();
              if (showHistoryModal) fetchHistoryReadings();
              setReadings((prev) => prev.filter((r) => r.id !== id));
            } catch (e: any) {
              Alert.alert(
                "Delete Failed",
                e.message || "Could not delete reading",
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const fetchHistoryReadings = async () => {
    if (!propertyId) return;
    setIsLoadingHistory(true);
    try {
      const { data } = await (supabase
        .from("electricity_readings")
        .select("*")
        .eq("property_id", propertyId)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false }) as any);
      setHistoryReadings((data as ElectricityReading[]) || []);
    } catch (e) {
      console.error("Error fetching history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (mode === "history") setShowHistoryModal(true);
    if (mode === "tariffs") setShowTariffModal(true);
  }, [mode]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const [metersRes, readingsRes, tariffsRes] = await Promise.all([
        electricityService.fetchMeters(propertyId),
        electricityService.fetchReadings(propertyId),
        electricityService.fetchTariffs(propertyId),
      ]);

      const metersData = (metersRes.success ? metersRes.data : []) ?? [];
      const readingsData = (readingsRes.success ? readingsRes.data : []) ?? [];
      const tariffsData = (tariffsRes.success ? tariffsRes.data : []) ?? [];

      setMeters(metersData as any);
      setReadings(readingsData as any);

      // Fetch previous closings
      const closings: Record<string, number> = {};
      const seen: Record<string, boolean> = {};
      readingsData.forEach((r: any) => {
        if (!seen[r.meter_id]) {
          seen[r.meter_id] = true;
          closings[r.meter_id] = r.closing_reading;
        }
      });
      setPreviousClosings(closings);

      // Set active tariff
      const todayStr = new Date().toISOString().split("T")[0];
      if (tariffsData.length > 0) {
        const active =
          tariffsData.find(
            (t: any) => !t.effective_to && t.effective_from <= todayStr,
          ) || tariffsData[0];
        setActiveTariff(active as any);
      }
    } catch (e) {
      console.error("Electricity fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.electricity(propertyId), fetchData, {
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  const handleOpenSheet = () => {
    setShowSheet(true);
  };

  const periodDates = getPeriodDates(period);
  const filteredReadings = readings.filter((r) => {
    const d = r.reading_date || r.created_at;
    return d >= periodDates.start && d <= periodDates.end + "T23:59:59";
  });

  // Latest reading per meter
  const latestPerMeter: Record<string, ElectricityReading> = {};
  readings.forEach((r) => {
    if (!latestPerMeter[r.meter_id]) latestPerMeter[r.meter_id] = r;
  });

  // Quick stats
const totalUnits = filteredReadings.reduce(
    (s, r) => s + (r.final_units ?? r.computed_units ?? 0),
    0
);
  const tariffRate = activeTariff?.rate_per_unit ?? 0;
  const totalCost = totalUnits * tariffRate;

  const periodMeterStats = useMemo(() => {
    const stats: Record<string, { units: number; cost: number }> = {};
    meters.forEach((m) => {
      stats[m.id] = { units: 0, cost: 0 };
    });
    filteredReadings.forEach((r) => {
      if (stats[r.meter_id]) {
        const u = r.final_units ?? r.computed_units ?? 0;
        stats[r.meter_id].units += u;
        // Simplified cost calculation using active tariff.
        // Real logic might need to check tariff history if readings span multiple tariffs.
        stats[r.meter_id].cost += u * tariffRate;
      }
    });
    return stats;
  }, [filteredReadings, meters, tariffRate]);

  const latestGenReadings = useMemo(() => {
    const result: Record<string, ElectricityReading> = {};
    readings.forEach((r) => {
      if (!result[r.meter_id]) result[r.meter_id] = r;
    });
    return result;
  }, [readings]);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, 12) + 90 },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={
          isDark
            ? ["#0F1521", "#121824", "#090d16"]
            : ["#F5F0E8", "#EAE0D5", "#DFD3C3"]
        }
        style={StyleSheet.absoluteFillObject}
      />

      {/* Top Navigation */}
      <SafeBlurView
        intensity={80}
        tint={theme === "dark" ? "dark" : "light"}
        style={[
          styles.topNav,
          {
            backgroundColor: "transparent",
            borderBottomColor: "rgba(255, 255, 255, 0.08)",
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.backCircleBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.headerTitleLine1}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            Electricity
          </Text>
          <Text style={styles.headerTitleLine2}>Logger</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() => setShowMeterModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() => {
              fetchHistoryReadings();
              setShowHistoryModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() =>
              router.push(
                `/property/${propertyId}/electricity/analytics` as any,
              )
            }
            activeOpacity={0.7}
          >
            <Ionicons name="analytics-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() => setShowTariffModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="bar-chart-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeBlurView>

      {/* Parameters Card */}
      <View
        style={[
          styles.paramCard,
          {
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.paramHeader}>
          <Ionicons
            name="options-outline"
            size={14}
            color="rgba(255, 255, 255, 0.4)"
          />
          <Text style={styles.paramTitle}>Parameters</Text>
        </View>

        {/* Period Selector Pill */}
        <View style={styles.paramSelectorContainer}>
          {PERIODS.map((p) => {
            const isActive = period === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.paramSelectorBtn,
                  isActive && styles.paramSelectorBtnActive,
                ]}
                onPress={() => setPeriod(p.value)}
              >
                <Text
                  style={[
                    styles.paramSelectorBtnText,
                    isActive && styles.paramSelectorBtnTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.oilUsedRow}>
          <Text style={styles.oilUsedLabel}>Energy Used :</Text>
          <Text style={styles.oilUsedValue}>{totalUnits.toFixed(1)}kVAh</Text>
        </View>

        <View style={styles.liveRankRow}>
          <Ionicons name="flash-outline" size={14} color="#FBBF24" />
          <Text style={styles.liveRankText}>
            Live Rank in {meters.map((m) => m.name).join("-")}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlashList
          data={meters}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          estimatedItemSize={280}
          ListHeaderComponent={
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Meters
            </Text>
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Zap size={36} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No meters configured
              </Text>
              <Text
                style={[styles.emptySubtext, { color: colors.textTertiary }]}
              >
                Add meters from the web dashboard
              </Text>
            </View>
          }
          ListFooterComponent={
            <>
              {readings.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.recentReadingsBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    fetchHistoryReadings();
                    setShowHistoryModal(true);
                  }}
                >
                  <View style={styles.recentReadingsBtnLeft}>
                    <Clock size={18} color={colors.primary} />
                    <Text
                      style={[
                        styles.recentReadingsBtnText,
                        { color: colors.text },
                      ]}
                    >
                      Recent Readings
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.recentReadingsBtnBadge,
                      { backgroundColor: colors.primary + "15" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.recentReadingsBtnBadgeText,
                        { color: colors.primary },
                      ]}
                    >
                      {readings.length}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              )}
              <View style={{ height: 100 }} />
            </>
          }
          renderItem={({ item: m }) => (
            <View style={{ marginBottom: 12 }}>
              <MeterCard
                meter={m}
                latestReading={latestGenReadings[m.id] ?? null}
                units={periodMeterStats[m.id]?.units ?? 0}
                cost={periodMeterStats[m.id]?.cost ?? 0}
                tariffRate={tariffRate}
                colors={colors}
                onPress={() => {
                  setSelectedMeterForLogging(m.id);
                  setShowSheet(true);
                }}
              />
            </View>
          )}
        />
      )}

      {/* Full History Modal */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={[styles.historyModalContainer, { backgroundColor: colors.background }]}>
          <SafeBlurView intensity={80} tint="dark" style={styles.historyModalHeader}>
            <View>
              <Text style={[styles.historyModalTitle, { color: colors.text }]}>Reading History</Text>
              <Text style={[styles.historyModalSub, { color: colors.textSecondary }]}>
                {historyReadings.length} record{historyReadings.length !== 1 ? 's' : ''} grouped by meter
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.historyCloseBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </SafeBlurView>

          {isLoadingHistory ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
              {historyReadings.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 80, gap: 14 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center' }}>
                    <Zap size={36} color={colors.textTertiary} />
                  </View>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No readings yet</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Urbanist-Medium', color: colors.textTertiary, textAlign: 'center' }}>
                    Log your first reading using the + button
                  </Text>
                </View>
              ) : (
                Object.entries(
                  historyReadings.reduce((groups: any, r) => {
                    const meter = meters.find((m) => m.id === r.meter_id);
                    const meterName = meter?.name ?? 'Unknown Meter';
                    if (!groups[meterName]) groups[meterName] = { meter, readings: [] };
                    groups[meterName].readings.push(r);
                    return groups;
                  }, {})
                ).map(([meterName, group]: [string, any]) => (
                  <View key={meterName} style={{ marginBottom: 24 }}>
                    {/* Meter header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary + '18', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="flash" size={18} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 15, fontFamily: 'Poppins-Bold', color: colors.text }}>{meterName}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Urbanist-Medium', color: colors.textSecondary }}>
                          {group.readings.length} reading{group.readings.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>

                    {/* Readings for this meter */}
                    {group.readings.map((r: any, idx: number, arr: any[]) => {
                      const units = r.final_units ?? r.computed_units ?? 0;
                      const isLast = idx === arr.length - 1;
                      return (
                        <View key={r.id} style={{ flexDirection: 'row' }}>
                          <View style={{ width: 28, alignItems: 'center' }}>
                            <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                            {!isLast && <View style={[styles.timelineLine, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />}
                          </View>
                          <SafeBlurView intensity={30} tint="dark" style={[styles.historyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                            <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                  {r.reading_date
                                    ? new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                                    : '—'}
                                </Text>
                                <Text style={{ fontSize: 11, fontFamily: 'Urbanist-Medium', color: colors.textTertiary, marginTop: 2 }}>
                                  {new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                  {r.notes ? ` · ${r.notes}` : ''}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={{ padding: 6, marginTop: -4 }}
                                onPress={() => handleDeleteReading(r.id)}
                                disabled={deletingId === r.id}
                              >
                                {deletingId === r.id ? (
                                  <ActivityIndicator size={14} color="#EF4444" />
                                ) : (
                                  <Trash2 size={16} color="#EF444480" />
                                )}
                              </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <TrendingUp size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>Units</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>{units.toFixed(1)}</Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>Closing</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>{r.closing_reading.toFixed(0)}</Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <Ionicons name="cash-outline" size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>Cost</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                    ₹{(r.computed_cost ?? 0).toFixed(0)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </SafeBlurView>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <LoggersMenu
        visible={showLoggersMenu}
        onClose={() => setShowLoggersMenu(false)}
        propertyId={propertyId!}
      />

      {showSheet && (
        <LogReadingModal
          visible={showSheet}
          onClose={() => {
            setShowSheet(false);
            setSelectedMeterForLogging(null);
          }}
          meters={meters}
          propertyId={propertyId!}
          colors={colors}
          onSuccess={fetchData}
          initialMeterId={selectedMeterForLogging}
          readings={readings}
        />
      )}

      {/* Tariff Modal */}
      <TariffModal
        visible={showTariffModal}
        onClose={() => setShowTariffModal(false)}
        propertyId={propertyId!}
        colors={colors}
        onTariffChange={async () => {
          const todayStr = new Date().toISOString().split("T")[0];
          try {
            const rpcRes = await serverApi.rpc("get_active_grid_tariff", {
              p_property_id: propertyId,
              p_date: todayStr,
            });
            if (rpcRes.data && (rpcRes.data as any[]).length > 0) {
              setActiveTariff((rpcRes.data as any[])[0]);
              return;
            }
            const allRes = await serverApi.query<any[]>({
              table: "grid_tariffs",
              action: "select",
              select: "*",
              filters: [{ op: "eq", column: "property_id", value: propertyId }],
              orders: [{ column: "effective_from", ascending: false }],
            });
            if (allRes.data && allRes.data.length > 0) {
              const active =
                allRes.data.find(
                  (t: any) => !t.effective_to && t.effective_from <= todayStr,
                ) || allRes.data[0];
              setActiveTariff(active as any);
            }
          } catch (e) {
            console.error("Error refreshing tariff:", e);
          }
        }}
      />

      {/* Meter Config Modal */}
      <MeterConfigModal
        visible={showMeterModal}
        onClose={() => setShowMeterModal(false)}
        propertyId={propertyId!}
        colors={colors}
        onSuccess={async () => {
          setShowMeterModal(false);
          await fetchData();
        }}
      />

      {/* Loggers Modal */}
      <Modal
        visible={showLoggersMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoggersMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLoggersMenu(false)}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              Loggers
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
              onPress={() => {
                setShowLoggersMenu(false);
                router.push(`/property/${propertyId}/electricity` as any);
              }}
            >
              <Ionicons name="flash-outline" size={20} color={colors.primary} />
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: colors.text }}
              >
                Electricity Logger
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
              onPress={() => {
                setShowLoggersMenu(false);
                router.push(`/property/${propertyId}/diesel` as any);
              }}
            >
              <Ionicons name="water-outline" size={20} color={colors.primary} />
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: colors.text }}
              >
                Diesel Logger
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 16 },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  periodRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  periodBtnActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  periodBtnText: {
    fontSize: 13,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255,255,255,0.8)",
  },
  periodBtnTextActive: { color: "#1A2332" },
  quickStatsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    alignItems: "center",
  },
  quickStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  quickStatText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255,255,255,0.75)",
  },
  analyticsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
  },
  analyticsBtnText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255,255,255,0.9)",
  },
  tariffInfo: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255,255,255,0.6)",
    marginTop: 6,
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255,255,255,0.9)",
  },

  // Log FAB
  logFab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  logFabText: { fontSize: 16, fontFamily: "Poppins-Bold", color: "#FFFFFF" },

  // Section
  sectionTitle: { fontSize: 16, fontFamily: "Poppins-Bold", marginBottom: 12 },

  // Meter Cards
  genCardsList: { gap: 12 },
  meterCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  meterCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  meterCardName: { fontSize: 16, fontFamily: "Poppins-Bold" },
  meterCardMeta: { fontSize: 12, fontFamily: "Urbanist-Medium", marginTop: 2 },
  meterStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  meterStatusDot: { width: 6, height: 6, borderRadius: 3 },
  meterStatusText: { fontSize: 11, fontFamily: "Urbanist-Bold" },

  // Readings row
  readingsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  readingItem: { flex: 1, alignItems: "center" },
  readingDivider: { width: 1, height: 40 },
  readingLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  readingValue: { fontSize: 18, fontFamily: "Poppins-Bold", marginTop: 4 },
  readingUnit: { fontSize: 10, fontFamily: "Urbanist-Medium" },

  // Cost row
  costRow: { flexDirection: "row", borderRadius: 10, padding: 10 },
  costItem: { flex: 1, alignItems: "center" },
  costLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
  },
  costValue: { fontSize: 15, fontFamily: "Poppins-Bold", marginTop: 2 },

  // Recent
  recentSection: { marginTop: 24 },
  recentSectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    marginBottom: 12,
  },
  readingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  readingRowLeft: { flex: 1 },
  readingGenName: { fontSize: 14, fontFamily: "Poppins-Bold" },
  readingTime: { fontSize: 11, fontFamily: "Urbanist-Medium", marginTop: 2 },
  readingRowRight: { alignItems: "flex-end" },
  recentReadingValue: { fontSize: 14, fontFamily: "Poppins-Bold" },
  readingSub: { fontSize: 11, fontFamily: "Urbanist-Medium", marginTop: 2 },

  // Empty
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 15, fontFamily: "Urbanist-Medium" },
  emptySubtext: { fontSize: 12, fontFamily: "Urbanist-Regular" },

  // Tariff Modal
  tariffModalContainer: { flex: 1 },
  tariffModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  tariffModalTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },
  tariffForm: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  tariffFormTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    marginBottom: 12,
  },
  tariffFieldLabel: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  tariffInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    fontFamily: "Urbanist-Medium",
    marginBottom: 4,
  },
  tariffError: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  tariffErrorText: {
    color: "#EF4444",
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
  },
  tariffSubmitBtn: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  tariffSubmitBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontFamily: "Poppins-Bold",
  },
  tariffHistoryTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    marginBottom: 12,
  },
  tariffHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  tariffRateText: { fontSize: 20, fontFamily: "Poppins-Bold" },
  tariffActiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tariffActiveBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
  },
  tariffProvider: { fontSize: 12, fontFamily: "Urbanist-Medium", marginTop: 2 },
  tariffDateRange: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
    marginTop: 4,
  },

  // Calendar modal
  calendarModalContent: {
    width: SCREEN_WIDTH - 48,
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: 460,
  },
  calendarModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  calendarModalTitle: { fontSize: 16, fontFamily: "Poppins-Bold" },

  // Meter Config
  meterTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  meterTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  meterTypeBtnText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    color: "#64748B",
  },
  multiplierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  multiplierField: { flex: 1, minWidth: "45%" },

  // Bottom Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontFamily: "Poppins-Bold" },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  picker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerText: { fontSize: 15, fontFamily: "Urbanist-Medium" },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  pickerOption: { padding: 12, paddingHorizontal: 16 },
  pickerOptionText: { fontSize: 14, fontFamily: "Urbanist-Medium" },
  pickerOptionSub: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    marginTop: 1,
  },
  openingInfo: {
    flexDirection: "row",
    gap: 16,
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  openingItem: { flex: 1 },
  openingLabel: { fontSize: 11, fontFamily: "Urbanist-Medium" },
  openingValue: { fontSize: 18, fontFamily: "Poppins-Bold", marginTop: 2 },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: "Urbanist-Medium",
  },
  notesInput: { height: 80, textAlignVertical: "top" },
  unitsPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  unitsPreviewText: { fontSize: 14, fontFamily: "Urbanist-Bold" },
  submitBtn: {
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Poppins-Bold", color: "#FFFFFF" },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  headerTitleLine1: {
    fontSize: 14,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTitleLine2: {
    fontSize: 22,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginTop: -2,
  },
  headerCircularBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  paramCard: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },
  paramHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  paramTitle: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  paramSelectorContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  paramSelectorBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  paramSelectorBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  paramSelectorBtnText: {
    fontSize: 13,
    fontFamily: "Urbanist-Bold",
    color: "rgba(255, 255, 255, 0.6)",
  },
  paramSelectorBtnTextActive: {
    color: "#0F1521",
  },
  oilUsedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  oilUsedLabel: {
    fontSize: 14,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255, 255, 255, 0.5)",
  },
  oilUsedValue: {
    fontSize: 14,
    fontFamily: "Urbanist-Bold",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  liveRankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  liveRankText: {
    fontSize: 13,
    fontFamily: "Urbanist-Medium",
    color: "#FBBF24",
  },
  genCardFuel: {
    marginTop: 14,
    marginBottom: 14,
  },
  genCardFuelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  genCardFuelLabel: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gaugeTrack: {},
  gaugeLabel: {},
  genCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    paddingTop: 12,
    marginTop: 4,
  },
  genCardFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  genCardFooterText: {
    fontSize: 12,
  },
  bottomNav: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
  },
  navItemCenter: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
  },
  navIconWrapper: {
    width: 44,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  centerFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  navText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // History modal
  historyModalContainer: { flex: 1 },
  historyModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: Math.max(60, 20),
    borderBottomWidth: 1,
  },
  historyModalTitle: { fontSize: 20, fontFamily: "Poppins-Bold" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  historyRowLeft: { flex: 1 },
  historyRowName: { fontSize: 14, fontFamily: "Poppins-Bold", marginBottom: 2 },
  historyRowDate: { fontSize: 11, fontFamily: "Urbanist-Medium" },
  historyRowNotes: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    marginTop: 2,
  },
  historyRowRight: { alignItems: "flex-end" },
  historyRowUnits: { fontSize: 15, fontFamily: "Poppins-Bold" },
  historyRowClosing: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
    marginTop: 2,
  },
  viewHistoryBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  viewHistoryBtnText: {
    fontSize: 13,
    fontFamily: "Poppins-Bold",
  },
  recentReadingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
  },
  recentReadingsBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recentReadingsBtnText: {
    fontSize: 14,
    fontFamily: "Poppins-Bold",
  },
  recentReadingsBtnBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
    marginRight: 4,
  },
  recentReadingsBtnBadgeText: {
    fontSize: 12,
    fontFamily: "Poppins-Bold",
  },

  // Custom Date Picker
  customDatePickerContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  customDateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  customDateNavBtn: {
    padding: 6,
  },
  customDateTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
  customDateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  customDateCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  customDateDayLabel: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
  },
  customDateDayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  customDateDayText: {
    fontSize: 14,
    fontFamily: "Urbanist-Bold",
  },

  // History modal styles
  historyModalSub: {
    fontSize: 13,
    fontFamily: "Urbanist-Medium",
    marginTop: 2,
  },
  historyCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 14,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  historyCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginLeft: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
});
