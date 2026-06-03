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
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase/client";
import { dieselService } from "@/services/dieselService";

import { LoggersMenu } from "@/components/shared/LoggersMenu";
import GeneratorConfigModal from "@/components/diesel/GeneratorConfigModal";
import DGTariffModal from "@/components/diesel/DGTariffModal";
import SafeBlurView from "@/components/ui/SafeBlurView";
import { LinearGradient } from "expo-linear-gradient";
import {
  Fuel,
  ChevronDown,
  X,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useDashboardFetch } from '@/hooks/useDashboardFetch';
import { queryKeys } from '@/utils/queryKeys';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Generator {
  id: string;
  name: string;
  make?: string;
  capacity_kva?: number;
  tank_capacity_litres?: number;
  status: string;
  initial_run_hours?: number;
  initial_kwh_reading?: number;
  initial_diesel_level?: number;
}

interface DieselReading {
  id: string;
  generator_id: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh?: number;
  closing_kwh?: number;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  computed_consumed_litres?: number;
  notes?: string;
  reading_date?: string;
  created_at: string;
}

interface LastClosing {
  hours: number;
  kwh: number;
  diesel: number;
  closing_kwh?: number;
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

// ─── Fuel Gauge ──────────────────────────────────────────────────────────────

function FuelGauge({
  level,
  maxLitres,
  size = "normal",
}: {
  level: number;
  maxLitres: number;
  size?: "small" | "normal";
}) {
  const { theme } = useTheme();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();
  const pct =
    maxLitres > 0 ? Math.min(100, Math.max(0, (level / maxLitres) * 100)) : 0;
  const isLow = pct < 20;

  const gaugeHeight = size === "small" ? 8 : 12;
  const gaugeRadius = size === "small" ? 4 : 6;

  return (
    <View style={{ gap: 4 }}>
      <View
        style={[
          styles.gaugeTrack,
          { height: gaugeHeight, backgroundColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.gaugeFill,
            {
              width: `${pct}%`,
              height: gaugeHeight,
              backgroundColor: isLow ? colors.error : colors.primary,
              borderRadius: gaugeRadius,
            },
          ]}
        />
      </View>
      <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>
        {level.toFixed(0)} L / {maxLitres.toFixed(0)} L ({pct.toFixed(0)}%)
      </Text>
    </View>
  );
}

// ─── Generator Card ───────────────────────────────────────────────────────────

const GeneratorCard = React.memo(function GeneratorCard({
  generator,
  lastClosing,
  latestReading,
  periodHours,
  periodConsumption,
  colors,
  onPress,
  onEdit,
}: {
  generator: Generator;
  lastClosing: LastClosing | null;
  latestReading: DieselReading | null;
  periodHours: number;
  periodConsumption: number;
  colors: typeof Colors.light;
  onPress: () => void;
  onEdit: () => void;
}) {
  const fuelLevel =
    latestReading?.closing_diesel_level ?? lastClosing?.diesel ?? 0;
  const tankCapacity = generator.tank_capacity_litres ?? 1000;
  const pct =
    tankCapacity > 0
      ? Math.min(100, Math.max(0, (fuelLevel / tankCapacity) * 100))
      : 0;

  const lastReadingTime = latestReading?.created_at
    ? formatRelative(latestReading.created_at)
    : "No reading yet";

  const isLive = generator.status === "active";
  const statusColor = isLive ? "#10B981" : "#EF4444";
  const statusLabel = isLive ? "Live" : "Idle";

  // Format fuel level with padding if needed
  const formattedLevel = fuelLevel.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <TouchableOpacity
      style={[
        styles.genCard,
        {
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={styles.genCardHeader}>
        <View style={styles.genCardHeaderLeft}>
          <Text style={[styles.genCardName, { color: colors.text }]}>
            {generator.name}
          </Text>
          <Text
            style={[styles.genCardMeta, { color: "rgba(255, 255, 255, 0.4)" }]}
          >
            {generator.make || "DG"} - {generator.capacity_kva ?? "?"} KVA
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={[
              styles.genStatusBadge,
              {
                backgroundColor: isLive
                  ? "rgba(16, 185, 129, 0.12)"
                  : "rgba(239, 68, 68, 0.12)",
              },
            ]}
          >
            <View
              style={[styles.genStatusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.genStatusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="open-outline"
              size={18}
              color="rgba(255, 255, 255, 0.5)"
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.genCardFuel}>
        <View style={styles.genCardFuelHeader}>
          <Ionicons
            name="color-filter-outline"
            size={14}
            color="rgba(255, 255, 255, 0.6)"
          />
          <Text
            style={[
              styles.genCardFuelLabel,
              { color: "rgba(255, 255, 255, 0.5)" },
            ]}
          >
            Fuel Level
          </Text>
        </View>

        {/* sleeker progress bar track */}
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
          {formattedLevel} L / {tankCapacity.toLocaleString()}
        </Text>
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

        {/* mock direction indicators from reference mockup */}
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
    </TouchableOpacity>
  );
});

// ─── Log Reading Modal ─────────────────────────────────────────────────────────

function LogReadingModal({
  visible,
  onClose,
  generators,
  propertyId,
  colors,
  onSuccess,
  initialGenId,
}: {
  visible: boolean;
  onClose: () => void;
  generators: Generator[];
  propertyId: string;
  colors: typeof Colors.light;
  onSuccess: () => void;
  initialGenId?: string | null;
}) {
  const [selectedGenId, setSelectedGenId] = useState<string>("");
  const [closingHours, setClosingHours] = useState("");
  const [closingKwh, setClosingKwh] = useState("");
  const [closingDiesel, setClosingDiesel] = useState("");
  const [dieselAdded, setDieselAdded] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGenPicker, setShowGenPicker] = useState(false);
  const [lastClosings, setLastClosings] = useState<Record<string, LastClosing>>(
    {},
  );
  const [ceilings, setCeilings] = useState<
    Record<string, { hours: number | null; diesel: number | null }>
  >({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [readingDate, setReadingDate] = useState<string>(today);

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

  const selectedGen = generators.find((g) => g.id === selectedGenId);

  useEffect(() => {
    if (visible && generators.length > 0) {
      if (initialGenId) {
        setSelectedGenId(initialGenId);
      } else if (
        !selectedGenId ||
        !generators.find((g) => g.id === selectedGenId)
      ) {
        setSelectedGenId(generators[0].id);
      }
    }
  }, [visible, generators, initialGenId]);

  useEffect(() => {
    if (!visible || !selectedGenId) return;
    const loadBounds = async () => {
      // 1. Fetch latest reading BEFORE or ON this date
      const { data: beforeData } = await (supabase
        .from("diesel_readings")
        .select("closing_hours, closing_diesel_level, closing_kwh")
        .eq("property_id", propertyId)
        .eq("generator_id", selectedGenId)
        .lt("reading_date", readingDate)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as any);

      if (beforeData) {
        setLastClosings((prev) => ({
          ...prev,
          [selectedGenId]: {
            hours: beforeData.closing_hours,
            diesel: beforeData.closing_diesel_level,
            kwh: beforeData.closing_kwh,
          },
        }));
      } else {
        setLastClosings((prev) => ({
          ...prev,
          [selectedGenId]: {
            hours: selectedGen?.initial_run_hours ?? 0,
            diesel: selectedGen?.initial_diesel_level ?? 0,
            kwh: selectedGen?.initial_kwh_reading ?? 0,
          },
        }));
      }

      // 2. Fetch earliest reading AFTER this date
      const { data: afterData } = await (supabase
        .from("diesel_readings")
        .select("opening_hours, opening_diesel_level")
        .eq("property_id", propertyId)
        .eq("generator_id", selectedGenId)
        .gt("reading_date", readingDate)
        .order("reading_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle() as any);

      setCeilings((prev) => ({
        ...prev,
        [selectedGenId]: {
          hours: afterData?.opening_hours ?? null,
          diesel: afterData?.opening_diesel_level ?? null,
        },
      }));
    };
    loadBounds();
  }, [visible, selectedGenId, readingDate, propertyId]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setClosingHours("");
      setClosingKwh("");
      setClosingDiesel("");
      setDieselAdded("");
      setNotes("");
      setShowGenPicker(false);
    }
  }, [visible]);

  const opening = selectedGenId
    ? (lastClosings[selectedGenId] ?? {
        hours: 0,
        diesel: 0,
        kwh: 0,
        closing_kwh: 0,
      })
    : { hours: 0, diesel: 0, kwh: 0, closing_kwh: 0 };

  const consumed = (() => {
    const c = parseFloat(closingDiesel) || 0;
    const o = opening.diesel;
    const added = parseFloat(dieselAdded) || 0;
    if (!closingDiesel) return null;
    return Math.max(0, o + added - c);
  })();

  const handleSubmit = async () => {
    if (!selectedGenId || !closingHours || !closingDiesel) {
      Alert.alert(
        "Missing Fields",
        "Please fill in runtime hours and fuel level.",
      );
      return;
    }
    const o = opening;
    const cH = parseFloat(closingHours);
    const cK = parseFloat(closingKwh) || 0;
    const cD = parseFloat(closingDiesel);
    const added = parseFloat(dieselAdded) || 0;
    const ceiling = ceilings[selectedGenId] ?? { hours: null, diesel: null };

    if (cH < o.hours) {
      Alert.alert(
        "Invalid Runtime",
        `Current hours (${cH}) cannot be less than opening hours (${o.hours.toFixed(1)}).`,
      );
      return;
    }
    if (ceiling.hours !== null && cH > ceiling.hours) {
      Alert.alert(
        "Invalid Runtime",
        `Current hours (${cH}) cannot be greater than a future reading recorded (${ceiling.hours.toFixed(1)}).`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await dieselService.submitReading({
        property_id: propertyId,
        generator_id: selectedGenId,
        reading_date: readingDate,
        opening_hours: o.hours,
        closing_hours: cH,
        opening_kwh: o.kwh,
        closing_kwh: cK,
        opening_diesel_level: o.diesel,
        closing_diesel_level: cD,
        diesel_added_litres: added,
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
                Log Diesel Reading
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
              {/* Generator Picker */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Generator
              </Text>
              <TouchableOpacity
                style={[
                  styles.picker,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setShowGenPicker(!showGenPicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>
                  {selectedGen?.name ?? "Select Generator"}
                </Text>
                <ChevronDown size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showGenPicker && (
                <View
                  style={[
                    styles.pickerDropdown,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {generators.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.pickerOption,
                        g.id === selectedGenId && {
                          backgroundColor: colors.primaryLight,
                        },
                      ]}
                      onPress={() => {
                        setSelectedGenId(g.id);
                        setShowGenPicker(false);
                        setClosingHours("");
                        setClosingDiesel("");
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: colors.text },
                        ]}
                      >
                        {g.name}
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

              {/* Opening Info */}
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
                    Opening Hours
                  </Text>
                  <Text style={[styles.openingValue, { color: colors.text }]}>
                    {opening.hours.toFixed(1)}
                  </Text>
                </View>
                <View style={styles.openingItem}>
                  <Text
                    style={[
                      styles.openingLabel,
                      { color: colors.textTertiary },
                    ]}
                  >
                    Opening Level
                  </Text>
                  <Text style={[styles.openingValue, { color: colors.text }]}>
                    {opening.diesel.toFixed(0)} L
                  </Text>
                </View>
              </View>

              {/* Runtime Hours */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Current Runtime Hours
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
                value={closingHours}
                onChangeText={setClosingHours}
                placeholder="e.g. 125.5"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* KWH Reading */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Current kWh Reading
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
                value={closingKwh}
                onChangeText={setClosingKwh}
                placeholder="e.g. 5040"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* Fuel Level */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Closing Fuel Level (L)
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
                value={closingDiesel}
                onChangeText={setClosingDiesel}
                placeholder="Litres remaining"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* Diesel Added */}
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Diesel Added Today (L)
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
                value={dieselAdded}
                onChangeText={setDieselAdded}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />

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

              {/* Derived consumption */}
              {consumed !== null && (
                <View
                  style={[
                    styles.consumedBadge,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <TrendingUp size={14} color={colors.primary} />
                  <Text
                    style={[styles.consumedText, { color: colors.primary }]}
                  >
                    Derived consumption: {consumed.toFixed(1)} L
                  </Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                  (isSubmitting || !closingHours || !closingDiesel) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={handleSubmit}
                disabled={isSubmitting || !closingHours || !closingDiesel}
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
  generators,
  colors,
  onDelete,
  deletingId,
}: {
  readings: DieselReading[];
  generators: Generator[];
  colors: typeof Colors.light;
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}) {
  const genMap = useMemo(() => {
    const m: Record<string, string> = {};
    generators.forEach((g) => {
      m[g.id] = g.name;
    });
    return m;
  }, [generators]);

  if (readings.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <Text style={[styles.recentSectionTitle, { color: colors.text }]}>
        Recent Readings
      </Text>
      {readings.slice(0, 10).map((r) => (
        <View
          key={r.id}
          style={[styles.readingRow, { borderColor: colors.border }]}
        >
          <View style={styles.readingRowLeft}>
            <Text style={[styles.readingGenName, { color: colors.text }]}>
              {genMap[r.generator_id] ?? "Unknown"}
            </Text>
            <Text style={[styles.readingTime, { color: colors.textTertiary }]}>
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
            <Text style={[styles.readingValue, { color: colors.primary }]}>
              {r.closing_diesel_level.toFixed(0)} L
            </Text>
            <Text style={[styles.readingSub, { color: colors.textTertiary }]}>
              {(r.closing_hours - r.opening_hours).toFixed(1)}h run
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
      ))}
    </View>
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

export default function DieselScreen() {
  const { propertyId, mode } = useLocalSearchParams<{
    propertyId: string;
    mode?: string;
  }>();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  const [generators, setGenerators] = useState<Generator[]>([]);

  const [readings, setReadings] = useState<DieselReading[]>([]);
  const [lastClosings, setLastClosings] = useState<Record<string, LastClosing>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [showSheet, setShowSheet] = useState(false);
  const [showLoggersMenu, setShowLoggersMenu] = useState(false);
  const [selectedGenForLogging, setSelectedGenForLogging] = useState<
    string | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyReadings, setHistoryReadings] = useState<DieselReading[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showGenConfigModal, setShowGenConfigModal] = useState(false);
  const [editingGenerator, setEditingGenerator] = useState<
    Generator | undefined
  >(undefined);
  const [showTariffModal, setShowTariffModal] = useState(false);

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

              const delRes = await dieselService.deleteReading(id, propertyId as string);
              if (!delRes.success) throw new Error(String(delRes.error || 'Delete failed'));

              await fetchData();
              if (showHistoryModal) fetchHistoryReadings();
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

  useEffect(() => {
    if (mode === "history") setShowHistoryModal(true);
  }, [mode]);

  const fetchHistoryReadings = async () => {
    if (!propertyId) return;
    setIsLoadingHistory(true);
    try {
      const { data } = await (supabase
        .from("diesel_readings")
        .select("*")
        .eq("property_id", propertyId)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false }) as any);
      setHistoryReadings((data as DieselReading[]) || []);
    } catch (e) {
      console.error("Error fetching history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setIsLoading(true);
    try {
      const [gensRes, readingsRes] = await Promise.all([
        dieselService.fetchGenerators(propertyId),
        dieselService.fetchReadings(propertyId),
      ]);

      const gensData = (gensRes.success ? gensRes.data : []) ?? [];
      const readingsData: any[] = (readingsRes.success ? readingsRes.data : []) ?? [];

      setGenerators(gensData as any);

      // Latest per generator
      const latest: Record<string, DieselReading> = {};
      const closings: Record<string, LastClosing> = {};
      readingsData.forEach((r) => {
        if (!latest[r.generator_id]) {
          latest[r.generator_id] = r;
          closings[r.generator_id] = {
            hours: r.closing_hours,
            diesel: r.closing_diesel_level,
            kwh: r.closing_kwh ?? 0,
          };
        }
      });
      setReadings(readingsData);
      setLastClosings(closings);
    } catch (e) {
      console.error("Diesel fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  const { refetch } = useDashboardFetch(queryKeys.property.diesel(propertyId), fetchData, {
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

  const latestPerGen: Record<string, DieselReading> = {};
  filteredReadings.forEach((r) => {
    if (!latestPerGen[r.generator_id]) latestPerGen[r.generator_id] = r;
  });

  const periodGenStats = useMemo(() => {
    const stats: Record<string, { hours: number; consumption: number }> = {};
    generators.forEach((g) => {
      stats[g.id] = { hours: 0, consumption: 0 };
    });
    filteredReadings.forEach((r) => {
      if (stats[r.generator_id]) {
        stats[r.generator_id].hours += r.closing_hours - r.opening_hours;
        stats[r.generator_id].consumption += r.computed_consumed_litres ?? 0;
      }
    });
    return stats;
  }, [filteredReadings, generators]);

  const latestGenReadings = useMemo(() => {
    const result: Record<string, DieselReading> = {};
    readings.forEach((r) => {
      if (!result[r.generator_id]) result[r.generator_id] = r;
    });
    return result;
  }, [readings]);

  // Quick stats
  const totalConsumption = filteredReadings.reduce(
    (sum, r) => sum + (r.computed_consumed_litres ?? 0),
    0,
  );
  const totalRunHours = filteredReadings.reduce(
    (sum, r) => sum + (r.closing_hours - r.opening_hours),
    0,
  );
  const lowFuelGens = generators.filter((g) => {
    const latest = latestGenReadings[g.id];
    const level =
      latest?.closing_diesel_level ?? lastClosings[g.id]?.diesel ?? 0;
    const cap = g.tank_capacity_litres ?? 1000;
    return level / cap < 0.2;
  });

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
            Diesel
          </Text>
          <Text style={styles.headerTitleLine2}>Logger</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() => {
              setEditingGenerator(undefined);
              setShowGenConfigModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerCircularBtn}
            onPress={() =>
              router.push(`/property/${propertyId}/diesel/analytics` as any)
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
          <Text style={styles.oilUsedLabel}>IS Oil Used :</Text>
          <Text style={styles.oilUsedValue}>
            {totalConsumption.toFixed(2)}Ltrs
          </Text>
        </View>

        <View style={styles.liveRankRow}>
          <Ionicons name="water-outline" size={14} color="#FBBF24" />
          <Text style={styles.liveRankText}>
            Live Rank in {generators.map((g) => g.name).join("-")}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlashList
          data={generators}
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
          estimatedItemSize={180}
          ListHeaderComponent={
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              DG Sets
            </Text>
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Fuel size={36} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No generators configured
              </Text>
              <Text
                style={[styles.emptySubtext, { color: colors.textTertiary }]}
              >
                Add generators from the web dashboard
              </Text>
            </View>
          }
          ListFooterComponent={
            <>
              {/* Recent Readings */}
              <RecentReadingsList
                readings={filteredReadings}
                generators={generators}
                colors={colors}
                onDelete={handleDeleteReading}
                deletingId={deletingId}
              />
              {readings.length > 0 && (
                <TouchableOpacity
                  style={[styles.viewHistoryBtn]}
                  onPress={() => {
                    fetchHistoryReadings();
                    setShowHistoryModal(true);
                  }}
                >
                  <Text
                    style={[
                      styles.viewHistoryBtnText,
                      { color: colors.primary },
                    ]}
                  >
                    View Full History
                  </Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 100 }} />
            </>
          }
          renderItem={({ item: gen }) => (
            <View style={{ marginBottom: 12 }}>
              <GeneratorCard
                generator={gen}
                lastClosing={lastClosings[gen.id] ?? null}
                latestReading={latestGenReadings[gen.id] ?? null}
                periodHours={periodGenStats[gen.id]?.hours ?? 0}
                periodConsumption={periodGenStats[gen.id]?.consumption ?? 0}
                colors={colors}
                onPress={() => {
                  setSelectedGenForLogging(gen.id);
                  setShowSheet(true);
                }}
                onEdit={() => {
                  setEditingGenerator(gen);
                  setShowGenConfigModal(true);
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
                {historyReadings.length} record{historyReadings.length !== 1 ? 's' : ''} across all DG sets
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowHistoryModal(false)}
              style={styles.historyCloseBtn}
            >
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
                    <Fuel size={36} color={colors.textTertiary} />
                  </View>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No readings yet</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Urbanist-Medium', color: colors.textTertiary, textAlign: 'center' }}>
                    Log your first reading using the + button
                  </Text>
                </View>
              ) : (
                Object.entries(
                  historyReadings.reduce((groups: any, r) => {
                    const month = r.reading_date
                      ? new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : 'Unknown';
                    if (!groups[month]) groups[month] = [];
                    groups[month].push(r);
                    return groups;
                  }, {})
                ).map(([month, readings]: [string, any]) => (
                  <View key={month} style={{ marginBottom: 20 }}>
                    <Text style={[styles.historyMonthLabel, { color: colors.textSecondary }]}>{month}</Text>
                    {(readings as any[]).map((r, idx, arr) => {
                      const gen = generators.find((g) => g.id === r.generator_id);
                      const isLast = idx === arr.length - 1;
                      return (
                        <View key={r.id} style={{ flexDirection: 'row' }}>
                          {/* Timeline rail */}
                          <View style={{ width: 32, alignItems: 'center' }}>
                            <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                            {!isLast && <View style={[styles.timelineLine, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />}
                          </View>
                          {/* Card */}
                          <SafeBlurView intensity={30} tint="dark" style={[styles.historyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                            <LinearGradient colors={['rgba(255,255,255,0.04)', 'rgba(0,0,0,0.1)']} style={StyleSheet.absoluteFillObject} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <Text style={[styles.historyCardName, { color: colors.text }]}>{gen?.name ?? 'Unknown'}</Text>
                                  {r.diesel_added_litres > 0 && (
                                    <View style={{ backgroundColor: '#22C55E18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E40' }}>
                                      <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: '#22C55E' }}>+{r.diesel_added_litres}L</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={[styles.historyCardDate, { color: colors.textTertiary }]}>
                                  {r.reading_date
                                    ? new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—'}
                                  {' · '}
                                  {new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
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
                            {/* Stats row */}
                            <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <Clock size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>Run</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                    {(r.closing_hours - r.opening_hours).toFixed(1)}h
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <Fuel size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>Level</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                    {r.closing_diesel_level.toFixed(0)}L
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}>
                                  <Zap size={14} color={colors.textSecondary} />
                                </View>
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Urbanist-Bold', color: colors.textSecondary, textTransform: 'uppercase' }}>kWh</Text>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins-Bold', color: colors.text }}>
                                    {r.closing_kwh.toFixed(0)}
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
            setSelectedGenForLogging(null);
          }}
          generators={generators}
          propertyId={propertyId!}
          colors={colors}
          onSuccess={fetchData}
          initialGenId={selectedGenForLogging}
        />
      )}

      <GeneratorConfigModal
        visible={showGenConfigModal}
        onClose={() => {
          setShowGenConfigModal(false);
          setEditingGenerator(undefined);
        }}
        onSuccess={fetchData}
        propertyId={propertyId!}
        existingGenerator={editingGenerator}
      />

      <DGTariffModal
        visible={showTariffModal}
        onClose={() => setShowTariffModal(false)}
        propertyId={propertyId!}
        generators={generators}
      />
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
  lowFuelAlertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  lowFuelAlertText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: "#FFE082",
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

  // Generator Cards
  genCardsList: { gap: 12 },
  genCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  genCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  genCardHeaderLeft: { flex: 1 },
  genCardName: { fontSize: 16, fontFamily: "Poppins-Bold" },
  genCardMeta: { fontSize: 12, fontFamily: "Urbanist-Medium", marginTop: 2 },
  genStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  genStatusDot: { width: 6, height: 6, borderRadius: 3 },
  genStatusText: { fontSize: 11, fontFamily: "Urbanist-Bold" },
  genCardFuel: { marginBottom: 12 },
  genCardFuelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  genCardFuelLabel: { fontSize: 12, fontFamily: "Urbanist-Medium" },
  genCardFooter: { flexDirection: "row", alignItems: "center", gap: 12 },
  genCardFooterItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  genCardFooterText: { fontSize: 11, fontFamily: "Urbanist-Medium" },

  // Gauge
  gaugeTrack: { borderRadius: 6, overflow: "hidden" },
  gaugeFill: {},
  gaugeLabel: { fontSize: 11, fontFamily: "Urbanist-Medium", marginTop: 3 },

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
  readingValue: { fontSize: 14, fontFamily: "Poppins-Bold" },
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
  consumedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  consumedText: { fontSize: 14, fontFamily: "Urbanist-Bold" },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: Math.max(60, 20),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  historyModalTitle: { fontSize: 20, fontFamily: 'Poppins-Bold' },
  historyModalSub: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 4 },
  historyCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  historyMonthLabel: { fontSize: 13, fontFamily: 'Poppins-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, marginLeft: 40 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 22 },
  timelineLine: { width: 2, flex: 1, marginTop: 4 },
  historyCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  historyCardName: { fontSize: 15, fontFamily: 'Poppins-Bold' },
  historyCardDate: { fontSize: 11, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  viewHistoryBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  viewHistoryBtnText: {
    fontSize: 13,
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
});
