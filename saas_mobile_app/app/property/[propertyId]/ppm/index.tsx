import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  Linking,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { ppmService } from "@/services/ppmService";
import type { PPMSchedule, AMCContract } from "@/services/ppmService";
import SafeBlurView from "@/components/ui/SafeBlurView";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { readFileAsArrayBuffer, compressImage } from "@/utils/mediaUtils";

import {
  Wrench,
  CalendarDays,
  FileText,
  ChevronRight,
  ChevronLeft,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Plus,
  Camera,
  Trash2,
  MapPin,
  User,
  Phone,
  StickyNote,
  Upload,
  DownloadCloud,
} from "lucide-react-native";
import { useDashboardFetch } from "@/hooks/useDashboardFetch";
import { queryKeys } from '@/utils/queryKeys';

// ─── Types (saas_one schema) ─────────────────────────────────────────────────

// Types imported from @/services/ppmService

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return "-";
  return new Date(normalized + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return 999;
  const target = new Date(normalized + "T12:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function normalizeDate(value?: string | null): string {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return "";
}

function normalizeFrequency(value?: string | null): PPMSchedule["frequency"] {
  const normalized = (value ?? "").toLowerCase().trim();
  if (normalized === "annual") return "yearly";
  if (["yearly", "quarterly", "monthly", "weekly"].includes(normalized)) {
    return normalized as PPMSchedule["frequency"];
  }
  return "monthly";
}

function normalizeStatus(value?: string | null): PPMSchedule["status"] {
  const normalized = (value ?? "").toLowerCase().trim();
  if (normalized === "completed") return "done";
  if (["pending", "done", "postponed", "skipped"].includes(normalized)) {
    return normalized as PPMSchedule["status"];
  }
  return "pending";
}

function normalizeSchedule(row: any): PPMSchedule {
  const plannedDate = normalizeDate(row.planned_date ?? row.next_due);
  const doneDate = normalizeDate(row.done_date ?? row.last_completed);

  return {
    ...row,
    organization_id: row.organization_id ?? null,
    property_id: row.property_id ?? null,
    system_name:
      row.system_name ?? row.asset_name ?? row.detail_name ?? "PPM Task",
    detail_name: row.detail_name ?? row.description ?? null,
    scope_of_work: row.scope_of_work ?? row.description ?? null,
    frequency: normalizeFrequency(row.frequency ?? row.schedule_type),
    planned_date: plannedDate,
    done_date: doneDate || undefined,
    status: normalizeStatus(row.status),
  } as PPMSchedule;
}

function isOverdue(s: PPMSchedule): boolean {
  if (s.status === "done") return false;
  return daysUntil(s.planned_date) < 0;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ─── Memoized List Item Components ────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: PPMSchedule;
  colors: typeof Colors.light;
  onPress: () => void;
}

const ScheduleCard = React.memo(function ScheduleCard({
  schedule,
  colors,
  onPress,
}: ScheduleCardProps) {
  const days = daysUntil(schedule.planned_date);
  const overdue = isOverdue(schedule);
  const dueSoon = days >= 0 && days <= 3;
  return (
    <TouchableOpacity
      style={[
        styles.scheduleCard,
        {
          backgroundColor: "rgba(255,255,255,0.08)",
          borderColor: "rgba(255,255,255,0.15)",
          borderWidth: 1,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.scheduleCardLeft}>
        <View
          style={[
            styles.scheduleIconWrap,
            {
              backgroundColor: overdue
                ? colors.errorBg
                : dueSoon
                  ? colors.warningBg
                  : colors.successBg,
            },
          ]}
        >
          <Wrench
            size={16}
            color={
              overdue ? colors.error : dueSoon ? colors.warning : colors.success
            }
          />
        </View>
      </View>
      <View style={styles.scheduleCardContent}>
        <Text
          style={[styles.scheduleName, { color: colors.text }]}
          numberOfLines={1}
        >
          {schedule.system_name}
        </Text>
        <Text
          style={[styles.scheduleMeta, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {schedule.detail_name || schedule.scope_of_work || "No details"} ·{" "}
          {schedule.frequency}
        </Text>
        <Text style={[styles.scheduleMeta, { color: colors.textSecondary }]}>
          Due: {formatDate(schedule.planned_date)}
        </Text>
      </View>
      <View style={styles.scheduleCardRight}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: overdue
                ? colors.errorBg
                : dueSoon
                  ? colors.warningBg
                  : colors.successBg,
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color: overdue
                  ? colors.error
                  : dueSoon
                    ? colors.warning
                    : colors.success,
              },
            ]}
          >
            {overdue ? "OVERDUE" : dueSoon ? "DUE SOON" : "OK"}
          </Text>
        </View>
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
});

interface ContractCardProps {
  contract: any;
  colors: typeof Colors.light;
}

const ContractCard = React.memo(function ContractCard({
  contract,
  colors,
}: ContractCardProps) {
  const days = daysUntil(contract.end_date);
  const isExpired = days < 0;
  const isExpiringSoon = days >= 0 && days <= 30;
  const statusColor = isExpired
    ? colors.error
    : isExpiringSoon
      ? colors.warning
      : colors.success;
  const statusBg = isExpired
    ? colors.errorBg
    : isExpiringSoon
      ? colors.warningBg
      : colors.successBg;
  return (
    <TouchableOpacity
      style={[
        styles.contractCard,
        {
          backgroundColor: "rgba(255,255,255,0.08)",
          borderColor: "rgba(255,255,255,0.15)",
          borderWidth: 1,
        },
      ]}
    >
      <View style={styles.contractHeader}>
        <View style={[styles.contractIcon, { backgroundColor: statusBg }]}>
          <Building2 size={18} color={statusColor} />
        </View>
        <View style={styles.contractContent}>
          <Text
            style={[styles.contractAsset, { color: colors.text }]}
            numberOfLines={1}
          >
            {contract.asset_name}
          </Text>
          <Text
            style={[styles.contractVendor, { color: colors.textSecondary }]}
          >
            {contract.vendor_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {isExpired ? "EXPIRED" : isExpiringSoon ? "EXPIRING" : "ACTIVE"}
          </Text>
        </View>
      </View>
      <View style={styles.contractDates}>
        <View style={styles.dateItem}>
          <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>
            Start
          </Text>
          <Text style={[styles.dateValue, { color: colors.text }]}>
            {formatDate(contract.start_date)}
          </Text>
        </View>
        <View style={styles.dateDivider} />
        <View style={styles.dateItem}>
          <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>
            End
          </Text>
          <Text
            style={[
              styles.dateValue,
              { color: isExpired ? colors.error : colors.text },
            ]}
          >
            {formatDate(contract.end_date)}
          </Text>
        </View>
        {contract.contract_value && (
          <>
            <View style={styles.dateDivider} />
            <View style={styles.dateItem}>
              <Text style={[styles.dateLabel, { color: colors.textTertiary }]}>
                Value
              </Text>
              <Text style={[styles.dateValue, { color: colors.text }]}>
                ₹{contract.contract_value.toLocaleString()}
              </Text>
            </View>
          </>
        )}
      </View>
      {isExpiringSoon && !isExpired && (
        <View
          style={[styles.expiryAlert, { backgroundColor: colors.warningBg }]}
        >
          <Clock size={12} color={colors.warning} />
          <Text style={[styles.expiryAlertText, { color: colors.warning }]}>
            Expires in {days} day{days !== 1 ? "s" : ""}
          </Text>
        </View>
      )}
      {contract.description && (
        <Text
          style={[styles.contractDesc, { color: colors.textTertiary }]}
          numberOfLines={2}
        >
          {contract.description}
        </Text>
      )}
    </TouchableOpacity>
  );
});
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<
  string,
  { dot: string; bg: string; text: string; label: string }
> = {
  pending: {
    dot: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
    text: "#F59E0B",
    label: "Pending",
  },
  done: {
    dot: "#22C55E",
    bg: "rgba(34,197,94,0.12)",
    text: "#22C55E",
    label: "Completed",
  },
  postponed: {
    dot: "#F43F5E",
    bg: "rgba(244,63,94,0.12)",
    text: "#F43F5E",
    label: "Postponed",
  },
  skipped: {
    dot: "#94A3B8",
    bg: "rgba(148,163,184,0.12)",
    text: "#94A3B8",
    label: "Skipped",
  },
};

const FREQ_COLORS: Record<string, string> = {
  yearly: "#6366F1",
  quarterly: "#0EA5E9",
  monthly: "#F59E0B",
  weekly: "#22C55E",
};

// ─── Custom Month Calendar ────────────────────────────────────────────────────

function MonthCalendar({
  year,
  month,
  schedules,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number;
  schedules: PPMSchedule[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string | null) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = Colors[theme];

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = new Date().toISOString().split("T")[0];

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const getDots = (day: number): string[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const daySchedules = schedules.filter(
      (s) => normalizeDate(s.planned_date) === dateStr,
    );
    const dots = new Set<string>();
    daySchedules.forEach((s) => {
      if (isOverdue(s)) dots.add("#EF4444");
      else if (s.status === "pending") dots.add("#F59E0B");
      else if (s.status === "done") dots.add("#22C55E");
      else if (s.status === "postponed") dots.add("#F43F5E");
      else if (s.status === "skipped") dots.add("#94A3B8");
    });
    return Array.from(dots).slice(0, 3);
  };

  return (
    <View
      style={[
        styles.calendarCard,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.03)",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          borderWidth: 1,
        },
      ]}
    >
      {/* Day headers */}
      <View style={styles.calendarDayHeaderRow}>
        {DAY_NAMES.map((d) => (
          <Text
            key={d}
            style={[
              styles.calendarDayHeaderText,
              { color: colors.textTertiary },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>
      {/* Grid */}
      <View style={styles.calendarGrid}>
        {days.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.calendarCell} />;
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate === dateStr;
          const dots = getDots(day);
          return (
            <TouchableOpacity
              key={dateStr}
              style={styles.calendarCell}
              onPress={() => onSelectDate(isSelected ? null : dateStr)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.calendarDayCircle,
                  isToday && { borderColor: "#3B82F6", borderWidth: 1.5 },
                  isSelected && { backgroundColor: "#3B82F6" },
                ]}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    {
                      color: isSelected
                        ? "#FFFFFF"
                        : isDark
                          ? "#F8FAFC"
                          : "#1A2332",
                    },
                    isToday &&
                      !isSelected && { color: "#3B82F6", fontWeight: "700" },
                  ]}
                >
                  {day}
                </Text>
              </View>
              <View style={styles.calendarDotsRow}>
                {dots.map((color, i) => (
                  <View
                    key={i}
                    style={[styles.calendarDot, { backgroundColor: color }]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type PPMTab = "calendar" | "schedules" | "amc";

export default function PPMScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, membership } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PPMTab>("calendar");
  const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
  const [contracts, setContracts] = useState<AMCContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const hasPositionedCalendarRef = React.useRef(false);

  // Detail modal
  const [selectedSchedule, setSelectedSchedule] = useState<PPMSchedule | null>(
    null,
  );
  const [showDetail, setShowDetail] = useState(false);

  // Edit state inside detail modal
  const [editStatus, setEditStatus] =
    useState<PPMSchedule["status"]>("pending");
  const [editDoneDate, setEditDoneDate] = useState("");
  const [editRemark, setEditRemark] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Add schedule modal
  const [showAdd, setShowAdd] = useState(false);
  const [formSystemName, setFormSystemName] = useState("");
  const [formDetailName, setFormDetailName] = useState("");
  const [formScope, setFormScope] = useState("");
  const [formFreq, setFormFreq] = useState<PPMSchedule["frequency"]>("monthly");
  const [formPlannedDate, setFormPlannedDate] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formVendorName, setFormVendorName] = useState("");
  const [formVendorPhone, setFormVendorPhone] = useState("");

  const [showReport, setShowReport] = useState(false);

  // ── Computed ───────────────────────────────────────────────────────────────
  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p) => p.id === propertyId);
    return prop
      ? [
          "property_admin",
          "org_admin",
          "org_super_admin",
          "master_admin",
        ].includes(prop.role.toLowerCase())
      : false;
  }, [membership, propertyId]);

  const selectedDaySchedules = useMemo(() => {
    if (!selectedDate) return [];
    return schedules.filter(
      (s) => normalizeDate(s.planned_date) === selectedDate,
    );
  }, [schedules, selectedDate]);

  const overdueSchedules = useMemo(() => {
    return schedules.filter((s) => isOverdue(s));
  }, [schedules]);

  const expiringContracts = useMemo(() => {
    return contracts.filter(
      (c) => c.status === "expiring_soon" || c.status === "expired",
    );
  }, [contracts]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    if (!propertyId) return;
    try {
      const [schedulesRes, contractsRes] = await Promise.all([
        ppmService.fetchSchedules(propertyId as string, membership?.org_id ?? null),
        ppmService.fetchContracts(propertyId as string),
      ]);

      if (schedulesRes.success && schedulesRes.data) {
        const byId = new Map<string, PPMSchedule>();
        schedulesRes.data
          .filter((s) => s.planned_date)
          .forEach((s) => byId.set(s.id, s));

        setSchedules(
          Array.from(byId.values()).sort((a, b) =>
            a.planned_date.localeCompare(b.planned_date),
          ),
        );
      }

      if (contractsRes.success && contractsRes.data) {
        setContracts(contractsRes.data);
      }
    } catch (err) {
      console.error("Error fetching PPM data:", err);
    }
  }, [propertyId]);

  const fetchAll = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        await fetchSchedules();
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetchSchedules],
  );

  const { refetch } = useDashboardFetch(queryKeys.property.ppm(propertyId), fetchAll, {
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (hasPositionedCalendarRef.current || schedules.length === 0) return;

    const monthHasTasks = schedules.some((s) => {
      const date = normalizeDate(s.planned_date);
      return date.startsWith(
        `${calYear}-${String(calMonth + 1).padStart(2, "0")}`,
      );
    });

    if (monthHasTasks) {
      hasPositionedCalendarRef.current = true;
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const target =
      schedules.find((s) => s.planned_date >= today) ?? schedules[0];
    if (!target?.planned_date) return;

    const [year, month] = target.planned_date.split("-").map(Number);
    if (year && month) {
      setCalYear(year);
      setCalMonth(month - 1);
      setSelectedDate(target.planned_date);
      hasPositionedCalendarRef.current = true;
    }
  }, [calMonth, calYear, schedules]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const openDetail = (schedule: PPMSchedule) => {
    setSelectedSchedule(schedule);
    setEditStatus(schedule.status);
    setEditDoneDate(
      schedule.done_date || new Date().toISOString().split("T")[0],
    );
    setEditRemark(schedule.remark || "");
    setShowDetail(true);
  };

  const handleUpdateSchedule = async () => {
    if (!selectedSchedule || !user) return;
    setIsSaving(true);
    try {
      const res = await ppmService.updateSchedule({
        id: selectedSchedule.id,
        status: editStatus,
        done_date: editStatus === "done" ? editDoneDate : undefined,
        remark: editRemark,
        vendor_name: selectedSchedule.vendor_name,
        vendor_phone: selectedSchedule.vendor_phone,
        vendor_contact_person: selectedSchedule.vendor_contact_person,
      });
      if (res.success) {
        setShowDetail(false);
        await fetchSchedules();
        Alert.alert("Updated", "PPM task updated successfully");
      } else {
        Alert.alert("Error", String(res.error || "Failed to update"));
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSchedule = async () => {
    if (!formSystemName.trim() || !propertyId) {
      Alert.alert("Error", "System name is required");
      return;
    }
    setIsSaving(true);
    try {
      const res = await ppmService.createSchedule({
        property_id: propertyId,
        organization_id: membership?.org_id ?? null,
        system_name: formSystemName.trim(),
        detail_name: formDetailName.trim() || null,
        scope_of_work: formScope.trim() || null,
        frequency: formFreq,
        planned_date: formPlannedDate || new Date().toISOString().split("T")[0],
        location: formLocation.trim() || null,
        vendor_name: formVendorName.trim() || null,
        vendor_phone: formVendorPhone.trim() || null,
        status: "pending",
      });
      if (!res.success) throw new Error(String(res.error || 'Failed to create'));
      setShowAdd(false);
      resetAddForm();
      await fetchSchedules();
      Alert.alert("Success", "PPM schedule created");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to create schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const resetAddForm = () => {
    setFormSystemName("");
    setFormDetailName("");
    setFormScope("");
    setFormFreq("monthly");
    setFormPlannedDate("");
    setFormLocation("");
    setFormVendorName("");
    setFormVendorPhone("");
  };

  // ── Attachment Upload ──────────────────────────────────────────────────────
  const pickAndUploadPhotos = async () => {
    if (!selectedSchedule) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploadingPhoto(true);
    try {
      const existingPhotos = selectedSchedule.attachments?.photos || [];
      const newUrls: string[] = [];

      for (const asset of result.assets) {
        const compressedUri = await compressImage(asset.uri);
        const ext = asset.uri.split(".").pop() || "jpg";

        const formData = new FormData();
        formData.append("scheduleId", selectedSchedule.id);
        formData.append("propertyId", propertyId as string);
        formData.append("file", {
          uri: compressedUri,
          type: `image/${ext === "jpg" ? "jpeg" : ext}`,
          name: `photo_${Date.now()}.${ext}`,
        } as any);

        const res = await ppmService.uploadAttachment(
          propertyId as string,
          selectedSchedule.id,
          compressedUri,
          'photo',
        );
        if (!res.success || !res.data) {
          console.error("Upload error:", res.error);
          continue;
        }
        newUrls.push(res.data);
      }

      if (newUrls.length > 0) {
        const updatedAttachments = {
          ...(selectedSchedule.attachments || {}),
          photos: [...existingPhotos, ...newUrls],
        };
        setSelectedSchedule({
          ...selectedSchedule,
          attachments: updatedAttachments,
        });
        await fetchSchedules();
      }
    } catch (err: any) {
      Alert.alert("Upload Error", err.message || "Failed to upload photos");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async (index: number) => {
    if (!selectedSchedule) return;
    const photos = selectedSchedule.attachments?.photos || [];
    const photoUrl = photos[index];
    if (!photoUrl) return;

    try {
      const res = await ppmService.deleteAttachment(
        selectedSchedule.id,
        photoUrl,
        'photo',
      );
      if (!res.success) throw new Error(String(res.error || 'Failed to delete'));

      const updated = [...photos];
      updated.splice(index, 1);
      const updatedAttachments = {
        ...(selectedSchedule.attachments || {}),
        photos: updated,
      };
      setSelectedSchedule({
        ...selectedSchedule,
        attachments: updatedAttachments,
      });
      await fetchSchedules();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  // ── Calendar Navigation ────────────────────────────────────────────────────
  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };
  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const bgColor = theme === "light" ? "#FBF8F4" : colors.background;

  if (isLoading && schedules.length === 0 && contracts.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <LinearGradient
          colors={
            isDark
              ? ["#0F1521", "#121824", "#090d16"]
              : ["#F5F0E8", "#EAE0D5", "#DFD3C3"]
          }
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading PPM...
          </Text>
        </View>
      </View>
    );
  }

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

      {/* Header */}
      <SafeBlurView
        intensity={80}
        tint={isDark ? "dark" : "light"}
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            borderBottomWidth: 1,
            borderBottomColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.05)",
            overflow: "hidden",
          },
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: isDark
                ? "rgba(22, 27, 40, 0.65)"
                : "rgba(255, 255, 255, 0.7)",
            },
          ]}
        />
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backBtn,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
              },
            ]}
          >
            <ChevronLeft size={24} color={isDark ? "#FFFFFF" : "#000000"} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitleMain}>PPM</Text>
            <Text style={[styles.headerSubtitleMain, { color: "#94A3B8" }]}>
              Preventive Maintenance
            </Text>
          </View>
          {isAdmin ? (
            <TouchableOpacity
              style={[styles.headerAddBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAdd(true)}
              activeOpacity={0.8}
            >
              <Plus size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        <View style={[styles.tabBar, { marginTop: 20 }]}>
          {(["calendar", "schedules", "amc"] as PPMTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === tab
                  ? { backgroundColor: colors.primary }
                  : {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.04)",
                    },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              {tab === "calendar" && (
                <CalendarDays
                  size={14}
                  color={activeTab === tab ? "#fff" : colors.textSecondary}
                />
              )}
              {tab === "schedules" && (
                <Wrench
                  size={14}
                  color={activeTab === tab ? "#fff" : colors.textSecondary}
                />
              )}
              {tab === "amc" && (
                <FileText
                  size={14}
                  color={activeTab === tab ? "#fff" : colors.textSecondary}
                />
              )}
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? "#fff" : colors.textSecondary },
                ]}
              >
                {tab === "calendar"
                  ? "Calendar"
                  : tab === "schedules"
                    ? "Schedules"
                    : "AMC"}
              </Text>
              {tab === "schedules" && overdueSchedules.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {overdueSchedules.length}
                  </Text>
                </View>
              )}
              {tab === "amc" && expiringContracts.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {expiringContracts.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </SafeBlurView>

      {/* Calendar Tab */}
      {activeTab === "calendar" && (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.calendarContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Month navigator */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
              <ChevronLeft size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.monthNavTitle, { color: colors.text }]}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
              <ChevronRight size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <MonthCalendar
            year={calYear}
            month={calMonth}
            schedules={schedules}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#EF4444" }]}
              />
              <Text
                style={[styles.legendText, { color: colors.textSecondary }]}
              >
                Overdue
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#F59E0B" }]}
              />
              <Text
                style={[styles.legendText, { color: colors.textSecondary }]}
              >
                Pending
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#22C55E" }]}
              />
              <Text
                style={[styles.legendText, { color: colors.textSecondary }]}
              >
                Completed
              </Text>
            </View>
          </View>

          {/* Selected day details */}
          {selectedDate && (
            <View style={styles.dayDetailSection}>
              <Text style={[styles.dayDetailTitle, { color: colors.text }]}>
                {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                  "en-US",
                  { weekday: "long", month: "long", day: "numeric" },
                )}
              </Text>
              {selectedDaySchedules.length === 0 ? (
                <View
                  style={[
                    styles.emptyDay,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <CheckCircle2 size={24} color={colors.textTertiary} />
                  <Text
                    style={[
                      styles.emptyDayText,
                      { color: colors.textTertiary },
                    ]}
                  >
                    No schedules for this day
                  </Text>
                </View>
              ) : (
                selectedDaySchedules.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.scheduleCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => openDetail(s)}
                  >
                    <View style={styles.scheduleCardLeft}>
                      <View
                        style={[
                          styles.scheduleIconWrap,
                          {
                            backgroundColor: isOverdue(s)
                              ? colors.errorBg
                              : colors.warningBg,
                          },
                        ]}
                      >
                        <Wrench
                          size={16}
                          color={isOverdue(s) ? colors.error : colors.warning}
                        />
                      </View>
                    </View>
                    <View style={styles.scheduleCardContent}>
                      <Text
                        style={[styles.scheduleName, { color: colors.text }]}
                      >
                        {s.system_name}
                      </Text>
                      <Text
                        style={[
                          styles.scheduleMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {s.detail_name || s.scope_of_work || "No details"} ·{" "}
                        {s.frequency}
                      </Text>
                    </View>
                    <View style={styles.scheduleCardRight}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isOverdue(s)
                              ? colors.errorBg
                              : STATUS_COLORS[s.status]?.bg || colors.warningBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: isOverdue(s)
                                ? colors.error
                                : STATUS_COLORS[s.status]?.text ||
                                  colors.warning,
                            },
                          ]}
                        >
                          {isOverdue(s)
                            ? "OVERDUE"
                            : STATUS_COLORS[s.status]?.label?.toUpperCase() ||
                              s.status.toUpperCase()}
                        </Text>
                      </View>
                      <ChevronRight size={14} color={colors.textTertiary} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Overdue alert */}
          {overdueSchedules.length > 0 && (
            <View
              style={[
                styles.overdueAlert,
                { backgroundColor: isDark ? "rgba(239,68,68,0.1)" : "#FDEEEE" },
              ]}
            >
              <View style={styles.overdueAlertHeader}>
                <AlertTriangle size={16} color={colors.error} />
                <Text
                  style={[styles.overdueAlertTitle, { color: colors.error }]}
                >
                  {overdueSchedules.length} overdue task(s)
                </Text>
              </View>
              {overdueSchedules.slice(0, 3).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.overdueItem}
                  onPress={() => openDetail(s)}
                >
                  <Text
                    style={[styles.overdueItemText, { color: colors.text }]}
                  >
                    {s.system_name}
                    {s.detail_name ? ` — ${s.detail_name}` : ""}
                  </Text>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Schedules Tab */}
      {activeTab === "schedules" && (
        <FlashList
          data={schedules}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={120}
          ListHeaderComponent={
            overdueSchedules.length > 0 ? (
              <View
                style={[
                  styles.overdueBanner,
                  { backgroundColor: colors.errorBg },
                ]}
              >
                <AlertTriangle size={14} color={colors.error} />
                <Text
                  style={[styles.overdueBannerText, { color: colors.error }]}
                >
                  {overdueSchedules.length} overdue task(s)
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Wrench size={48} color={colors.textTertiary} />
              <Text
                style={[styles.emptyTitle, { color: colors.textSecondary }]}
              >
                No schedules yet
              </Text>
              {isAdmin && (
                <TouchableOpacity
                  style={[
                    styles.createBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setShowAdd(true)}
                >
                  <Text style={styles.createBtnText}>Add Schedule</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: s }) => (
            <ScheduleCard
              schedule={s}
              colors={colors}
              onPress={() => openDetail(s)}
            />
          )}
        />
      )}

      {/* AMC Tab */}
      {activeTab === "amc" && (
        <FlashList
          data={contracts}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={120}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FileText size={48} color={colors.textTertiary} />
              <Text
                style={[styles.emptyTitle, { color: colors.textSecondary }]}
              >
                No AMC contracts
              </Text>
            </View>
          }
          renderItem={({ item: contract }) => (
            <ContractCard contract={contract} colors={colors} />
          )}
        />
      )}

      {/* ── Task Detail Modal ── */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setShowDetail(false)}
          />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            {selectedSchedule && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                {/* Header */}
                <View style={styles.detailHeader}>
                  <View
                    style={[
                      styles.detailIconWrap,
                      { backgroundColor: colors.primary + "18" },
                    ]}
                  >
                    <Wrench size={24} color={colors.primary} />
                  </View>
                  <View style={styles.detailHeaderContent}>
                    <Text
                      style={[styles.detailTitle, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {selectedSchedule.system_name}
                    </Text>
                    <Text
                      style={[
                        styles.detailSubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {selectedSchedule.detail_name ||
                        selectedSchedule.scope_of_work ||
                        "PPM Task"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowDetail(false)}>
                    <X size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Stats row */}
                <View style={styles.detailStatsRow}>
                  <View
                    style={[
                      styles.detailStatCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      Planned
                    </Text>
                    <Text
                      style={[styles.detailStatValue, { color: colors.text }]}
                    >
                      {formatDate(selectedSchedule.planned_date)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.detailStatCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      Status
                    </Text>
                    <Text
                      style={[
                        styles.detailStatValue,
                        {
                          color: isOverdue(selectedSchedule)
                            ? colors.error
                            : STATUS_COLORS[selectedSchedule.status]?.text ||
                              colors.success,
                        },
                      ]}
                    >
                      {isOverdue(selectedSchedule)
                        ? "OVERDUE"
                        : STATUS_COLORS[
                            selectedSchedule.status
                          ]?.label?.toUpperCase()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.detailStatCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      Frequency
                    </Text>
                    <Text
                      style={[
                        styles.detailStatValue,
                        {
                          color:
                            FREQ_COLORS[selectedSchedule.frequency] ||
                            colors.text,
                        },
                      ]}
                    >
                      {selectedSchedule.frequency}
                    </Text>
                  </View>
                </View>

                {/* Info cards */}
                {selectedSchedule.location && (
                  <View
                    style={[
                      styles.infoRow,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <MapPin size={14} color={colors.textSecondary} />
                    <Text
                      style={[
                        styles.infoRowText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {selectedSchedule.location}
                    </Text>
                  </View>
                )}
                {selectedSchedule.scope_of_work && (
                  <View
                    style={[
                      styles.descBanner,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[styles.descText, { color: colors.textSecondary }]}
                    >
                      {selectedSchedule.scope_of_work}
                    </Text>
                  </View>
                )}

                {/* Vendor */}
                {(selectedSchedule.vendor_name ||
                  selectedSchedule.vendor_phone ||
                  selectedSchedule.maintenance_vendors) && (
                  <View
                    style={[
                      styles.sectionCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      VENDOR
                    </Text>
                    <Text style={[styles.sectionValue, { color: colors.text }]}>
                      {selectedSchedule.maintenance_vendors?.company_name ||
                        selectedSchedule.vendor_name ||
                        "N/A"}
                    </Text>
                    {(selectedSchedule.maintenance_vendors?.contact_person ||
                      selectedSchedule.vendor_contact_person) && (
                      <Text
                        style={[
                          styles.sectionSub,
                          { color: colors.textSecondary },
                        ]}
                      >
                        <User size={12} color={colors.textSecondary} />{" "}
                        {selectedSchedule.maintenance_vendors?.contact_person ||
                          selectedSchedule.vendor_contact_person}
                      </Text>
                    )}
                    {(selectedSchedule.maintenance_vendors?.phone ||
                      selectedSchedule.vendor_phone) && (
                      <Text
                        style={[
                          styles.sectionSub,
                          { color: colors.textSecondary },
                        ]}
                      >
                        <Phone size={12} color={colors.textSecondary} />{" "}
                        {selectedSchedule.maintenance_vendors?.phone ||
                          selectedSchedule.vendor_phone}
                      </Text>
                    )}
                  </View>
                )}

                {/* Status picker */}
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  STATUS
                </Text>
                <View style={styles.statusPickerRow}>
                  {(["pending", "done", "postponed", "skipped"] as const).map(
                    (st) => (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusChip,
                          editStatus === st
                            ? {
                                backgroundColor: STATUS_COLORS[st].bg,
                                borderColor: STATUS_COLORS[st].text,
                              }
                            : {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                              },
                        ]}
                        onPress={() => setEditStatus(st)}
                      >
                        <View
                          style={[
                            styles.statusChipDot,
                            { backgroundColor: STATUS_COLORS[st].dot },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusChipText,
                            {
                              color:
                                editStatus === st
                                  ? STATUS_COLORS[st].text
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {STATUS_COLORS[st].label}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                {/* Done date & remark */}
                {editStatus === "done" && (
                  <>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      COMPLETION DATE
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
                      value={editDoneDate}
                      onChangeText={setEditDoneDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </>
                )}
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  REMARKS
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editRemark}
                  onChangeText={setEditRemark}
                  placeholder="Add notes or remarks..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />

                {/* Attachments */}
                {(editStatus === "done" ||
                  selectedSchedule.status === "done") && (
                  <View style={{ marginTop: 16 }}>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      ATTACHMENTS / PHOTOS
                    </Text>
                    {/* Combine both completion_photos (from web) and attachments.photos (from mobile) */}
                    {selectedSchedule.attachments?.photos?.length ||
                    selectedSchedule.completion_photos?.length ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: 12 }}
                      >
                        {[
                          ...(selectedSchedule.completion_photos || []),
                          ...(selectedSchedule.attachments?.photos || []),
                        ].map((url, idx) => (
                          <View key={idx} style={styles.photoThumbWrap}>
                            <Image
                              source={{ uri: url }}
                              style={styles.photoThumb}
                            />
                            {/* Only allow deleting photos if the task is still being edited/marked as done locally */}
                            {editStatus === "done" && (
                              <TouchableOpacity
                                style={styles.photoDeleteBtn}
                                onPress={() => deletePhoto(idx)}
                              >
                                <Trash2 size={12} color="#FFFFFF" />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                    {editStatus === "done" && (
                      <TouchableOpacity
                        style={[
                          styles.uploadBtn,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                          },
                        ]}
                        onPress={pickAndUploadPhotos}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ) : (
                          <>
                            <Camera size={18} color={colors.primary} />
                            <Text
                              style={[
                                styles.uploadBtnText,
                                { color: colors.primary },
                              ]}
                            >
                              Add Photos
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Verification status */}
                {selectedSchedule.verification_status &&
                  selectedSchedule.verification_status !== "pending" && (
                    <View
                      style={[
                        styles.verificationBanner,
                        {
                          backgroundColor:
                            selectedSchedule.verification_status === "verified"
                              ? "rgba(34,197,94,0.1)"
                              : selectedSchedule.verification_status ===
                                  "rejected"
                                ? "rgba(239,68,68,0.1)"
                                : "rgba(245,158,11,0.1)",
                        },
                      ]}
                    >
                      <CheckCircle2
                        size={16}
                        color={
                          selectedSchedule.verification_status === "verified"
                            ? "#22C55E"
                            : selectedSchedule.verification_status ===
                                "rejected"
                              ? "#EF4444"
                              : "#F59E0B"
                        }
                      />
                      <Text
                        style={[
                          styles.verificationText,
                          { color: colors.text },
                        ]}
                      >
                        Vendor proof {selectedSchedule.verification_status}
                        {selectedSchedule.verified_at
                          ? ` on ${formatDate(selectedSchedule.verified_at)}`
                          : ""}
                      </Text>
                    </View>
                  )}

                {/* Save or Report button */}
                {selectedSchedule.status === "done" ? (
                  <TouchableOpacity
                    style={[
                      styles.markCompleteBtn,
                      { backgroundColor: colors.success },
                      {
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                      },
                    ]}
                    onPress={() => setShowReport(true)}
                  >
                    <FileText size={18} color="#FFFFFF" />
                    <Text style={styles.markCompleteBtnText}>
                      View Full Report
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.markCompleteBtn,
                      { backgroundColor: colors.primary },
                      isSaving && { opacity: 0.6 },
                    ]}
                    onPress={handleUpdateSchedule}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.markCompleteBtnText}>
                        Update Task
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Add Schedule Modal ── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Add PPM Schedule
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowAdd(false);
                    resetAddForm();
                  }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  System Name *
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
                  placeholder="e.g. HVAC, Electrical"
                  placeholderTextColor={colors.textTertiary}
                  value={formSystemName}
                  onChangeText={setFormSystemName}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Detail / Equipment Name
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
                  placeholder="e.g. Unit A1, Generator #2"
                  placeholderTextColor={colors.textTertiary}
                  value={formDetailName}
                  onChangeText={setFormDetailName}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Scope of Work
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Describe the maintenance task..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  value={formScope}
                  onChangeText={setFormScope}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Frequency
                </Text>
                <View style={styles.scheduleTypeRow}>
                  {(["yearly", "quarterly", "monthly", "weekly"] as const).map(
                    (type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.typeChip,
                          formFreq === type
                            ? {
                                backgroundColor: FREQ_COLORS[type] + "18",
                                borderColor: FREQ_COLORS[type],
                              }
                            : {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                              },
                        ]}
                        onPress={() => setFormFreq(type)}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            {
                              color:
                                formFreq === type
                                  ? FREQ_COLORS[type]
                                  : colors.textSecondary,
                            },
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Planned Date (YYYY-MM-DD) *
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
                  placeholder="2026-05-20"
                  placeholderTextColor={colors.textTertiary}
                  value={formPlannedDate}
                  onChangeText={setFormPlannedDate}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Location
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
                  placeholder="e.g. Basement, Roof"
                  placeholderTextColor={colors.textTertiary}
                  value={formLocation}
                  onChangeText={setFormLocation}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Vendor Name
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
                  placeholder="Vendor company name"
                  placeholderTextColor={colors.textTertiary}
                  value={formVendorName}
                  onChangeText={setFormVendorName}
                />

                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Vendor Phone
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
                  placeholder="Phone number"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  value={formVendorPhone}
                  onChangeText={setFormVendorPhone}
                />
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                  isSaving && { opacity: 0.6 },
                ]}
                onPress={handleAddSchedule}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Create Schedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Report Modal ── */}
      <Modal
        visible={showReport}
        animationType="slide"
        onRequestClose={() => setShowReport(false)}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: colors.background, paddingTop: insets.top },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ["#0f172a", "#1e1b4b", "#0f172a"]
                : ["#eef2f6", "#f8fafc", "#ffffff"]
            }
            style={StyleSheet.absoluteFillObject}
          />

          <SafeBlurView
            intensity={80}
            tint="dark"
            style={[styles.header, { paddingTop: 16 }]}
          >
            <View style={styles.headerTop}>
              <TouchableOpacity
                onPress={() => setShowReport(false)}
                style={styles.backBtn}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.headerTitleMain}>Completion Report</Text>
              </View>
            </View>
          </SafeBlurView>

          {selectedSchedule && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            >
              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.1)",
                  },
                ]}
              >
                <Text
                  style={[styles.sectionLabel, { color: colors.textSecondary }]}
                >
                  TASK DETAILS
                </Text>
                <Text
                  style={[
                    styles.sectionValue,
                    { color: colors.text, fontSize: 18 },
                  ]}
                >
                  {selectedSchedule.system_name}
                </Text>
                <Text
                  style={[styles.sectionSub, { color: colors.textSecondary }]}
                >
                  {selectedSchedule.detail_name ||
                    selectedSchedule.scope_of_work}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
                  <View>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      FREQUENCY
                    </Text>
                    <Text
                      style={[
                        styles.sectionSub,
                        { color: colors.text, textTransform: "capitalize" },
                      ]}
                    >
                      {selectedSchedule.frequency}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      LOCATION
                    </Text>
                    <Text style={[styles.sectionSub, { color: colors.text }]}>
                      {selectedSchedule.location || "N/A"}
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.1)",
                  },
                ]}
              >
                <Text
                  style={[styles.sectionLabel, { color: colors.textSecondary }]}
                >
                  COMPLETION INFO
                </Text>
                <View
                  style={{ flexDirection: "row", marginBottom: 12, gap: 16 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      PLANNED DATE
                    </Text>
                    <Text style={[styles.sectionSub, { color: colors.text }]}>
                      {formatDate(selectedSchedule.planned_date)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      COMPLETED ON
                    </Text>
                    <Text
                      style={[
                        styles.sectionSub,
                        { color: colors.success, fontWeight: "bold" },
                      ]}
                    >
                      {formatDate(selectedSchedule.done_date || "")}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.sectionLabel, { color: colors.textTertiary }]}
                >
                  COMPLETED BY / VENDOR
                </Text>
                <Text style={[styles.sectionSub, { color: colors.text }]}>
                  {selectedSchedule.maintenance_vendors?.company_name ||
                    selectedSchedule.vendor_name ||
                    selectedSchedule.maker ||
                    "System / Vendor"}
                </Text>
                {selectedSchedule.remark && (
                  <View style={{ marginTop: 12 }}>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      REMARKS
                    </Text>
                    <Text style={[styles.sectionSub, { color: colors.text }]}>
                      {selectedSchedule.remark}
                    </Text>
                  </View>
                )}
              </View>

              {selectedSchedule.attachments?.photos?.length ||
              selectedSchedule.completion_photos?.length ? (
                <View
                  style={[
                    styles.sectionCard,
                    {
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.1)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    PHOTOS
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 8 }}
                  >
                    {[
                      ...(selectedSchedule.completion_photos || []),
                      ...(selectedSchedule.attachments?.photos || []),
                    ].map((url, idx) => (
                      <View
                        key={idx}
                        style={{
                          marginRight: 12,
                          borderRadius: 12,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.1)",
                        }}
                      >
                        <Image
                          source={{ uri: url }}
                          style={{ width: 120, height: 120 }}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {selectedSchedule.completion_doc_url ||
              selectedSchedule.invoice_url ||
              selectedSchedule.attachments?.certificate ||
              selectedSchedule.attachments?.invoice ? (
                <View
                  style={[
                    styles.sectionCard,
                    {
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.1)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    DOCUMENTS
                  </Text>
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {[
                      {
                        url:
                          selectedSchedule.completion_doc_url ||
                          selectedSchedule.attachments?.certificate,
                        label: "Completion Certificate",
                      },
                      {
                        url:
                          selectedSchedule.invoice_url ||
                          selectedSchedule.attachments?.invoice,
                        label: "Invoice / Bill",
                      },
                    ].map((doc, idx) =>
                      doc.url ? (
                        <TouchableOpacity
                          key={idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "rgba(255,255,255,0.05)",
                            padding: 12,
                            borderRadius: 10,
                          }}
                          onPress={() => Linking.openURL(doc.url as string)}
                        >
                          <DownloadCloud size={20} color={colors.primary} />
                          <Text
                            style={{
                              marginLeft: 10,
                              color: colors.text,
                              flex: 1,
                              fontFamily: "Urbanist-Medium",
                            }}
                          >
                            {doc.label}
                          </Text>
                          <ChevronRight size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ) : null,
                    )}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: { fontSize: 14, fontFamily: "Urbanist-Medium" },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: { flex: 1, marginLeft: 16 },
  headerTitleMain: {
    fontSize: 22,
    fontFamily: "Poppins-Bold",
    letterSpacing: -0.5,
    color: "#FFFFFF",
  },
  headerSubtitleMain: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    marginTop: 2,
  },
  headerAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  tabBar: { flexDirection: "row", gap: 10 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  tabText: { fontSize: 13, fontFamily: "Urbanist-Bold" },
  badge: {
    backgroundColor: "#EF6B6B",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Urbanist-Bold" },

  // Calendar
  calendarContent: { padding: 16, paddingBottom: 100 },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },

  calendarCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
  calendarDayHeaderRow: { flexDirection: "row", marginBottom: 8 },
  calendarDayHeaderText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: 8,
  },
  calendarDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayText: { fontSize: 14, fontFamily: "Urbanist-Medium" },
  calendarDotsRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 3,
    height: 6,
    alignItems: "center",
  },
  calendarDot: { width: 5, height: 5, borderRadius: 2.5 },

  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: "Urbanist-Medium" },

  dayDetailSection: { marginTop: 8 },
  dayDetailTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    marginBottom: 12,
  },
  emptyDay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 24,
  },
  emptyDayText: { fontSize: 13, fontFamily: "Urbanist-Medium" },

  overdueAlert: { marginTop: 16, borderRadius: 12, padding: 12 },
  overdueAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  overdueAlertTitle: { fontSize: 13, fontFamily: "Urbanist-Bold" },
  overdueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  overdueItemText: { fontSize: 13, fontFamily: "Urbanist-Medium", flex: 1 },

  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  overdueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  overdueBannerText: { fontSize: 12, fontFamily: "Urbanist-Bold" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Poppins-Bold" },
  createBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  createBtnText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins-Bold" },

  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  scheduleCardLeft: {},
  scheduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  scheduleCardContent: { flex: 1 },
  scheduleName: { fontSize: 14, fontFamily: "Poppins-Bold", marginBottom: 2 },
  scheduleMeta: { fontSize: 11, fontFamily: "Urbanist-Regular" },
  scheduleCardRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    letterSpacing: 0.5,
  },

  contractCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  contractHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  contractIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  contractContent: { flex: 1 },
  contractAsset: { fontSize: 15, fontFamily: "Poppins-Bold", marginBottom: 2 },
  contractVendor: { fontSize: 11, fontFamily: "Urbanist-Regular" },
  contractDates: { flexDirection: "row", alignItems: "center" },
  dateItem: { flex: 1, alignItems: "center" },
  dateLabel: {
    fontSize: 9,
    fontFamily: "Urbanist-Medium",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dateValue: { fontSize: 12, fontFamily: "Poppins-Bold", marginTop: 2 },
  dateDivider: { width: 1, height: 24, backgroundColor: "rgba(0,0,0,0.08)" },
  expiryAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  expiryAlertText: { fontSize: 11, fontFamily: "Urbanist-Bold" },
  contractDesc: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    marginTop: 8,
    lineHeight: 16,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },
  modalBody: { maxHeight: 400 },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Urbanist-Regular",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  scheduleTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    textTransform: "capitalize",
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Poppins-Bold" },

  // Detail sheet
  detailSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "85%",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  detailHeaderContent: { flex: 1 },
  detailTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },
  detailSubtitle: {
    fontSize: 12,
    fontFamily: "Urbanist-Regular",
    marginTop: 2,
  },
  detailStatsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  detailStatCard: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  detailStatLabel: {
    fontSize: 9,
    fontFamily: "Urbanist-Medium",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailStatValue: {
    fontSize: 13,
    fontFamily: "Poppins-Bold",
    marginTop: 4,
    textAlign: "center",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  infoRowText: { fontSize: 13, fontFamily: "Urbanist-Regular", flex: 1 },
  descBanner: { borderRadius: 10, padding: 12, marginBottom: 10 },
  descText: { fontSize: 13, fontFamily: "Urbanist-Regular", lineHeight: 20 },

  sectionCard: { borderRadius: 10, padding: 12, marginBottom: 12 },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionValue: { fontSize: 14, fontFamily: "Poppins-Bold", marginBottom: 2 },
  sectionSub: { fontSize: 12, fontFamily: "Urbanist-Regular", marginTop: 2 },

  statusPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusChipDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 12, fontFamily: "Urbanist-Bold" },

  photoThumbWrap: { marginRight: 10, position: "relative" },
  photoThumb: { width: 80, height: 80, borderRadius: 10 },
  photoDeleteBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    borderStyle: "dashed",
  },
  uploadBtnText: { fontSize: 14, fontFamily: "Urbanist-Bold" },

  verificationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  verificationText: { fontSize: 13, fontFamily: "Urbanist-Medium", flex: 1 },

  markCompleteBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  markCompleteBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Poppins-Bold",
  },
});
