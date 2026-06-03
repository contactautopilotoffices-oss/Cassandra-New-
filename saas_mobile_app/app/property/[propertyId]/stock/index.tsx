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
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { stockService } from "@/services/stockService";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import Animated, { FadeInUp } from "react-native-reanimated";
import SafeBlurView from "@/components/ui/SafeBlurView";

import {
  STATUS_COLORS,
  CARD_SURFACES,
  type StatusType,
} from "@/constants/designSystem";
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  X,
  QrCode,
  ChevronRight,
  TrendingDown,
  History,
  ArrowLeft,
  Scan,
  RefreshCw,
  Download,
} from "lucide-react-native";
import { useDashboardFetch } from "@/hooks/useDashboardFetch";
import { queryKeys } from '@/utils/queryKeys';

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  name: string;
  item_code: string;
  category: string;
  quantity: number;
  min_threshold: number;
  unit: string;
  unit_price: number;
  property_id: string;
  created_at: string;
  barcode?: string | null;
  location?: string | null;
  qr_code_data?: string | null;
  barcode_format?: string | null;
}

interface StockMovement {
  id: string;
  item_id: string;
  action: "add" | "remove";
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  notes: string | null;
  created_at: string;
  item_name?: string;
  item_code?: string;
  unit?: string;
  user_name?: string;
}

// ─── Design Tokens (Craxinno Glass) ───────────────────────────────────────────

const TOKENS = {
  bg: {
    gradient: ["#0B1B2A", "#0F2D3D", "#113B4D"] as const,
  },
  glass: {
    border: "rgba(255,255,255,0.18)",
    bg: "rgba(255,255,255,0.06)",
    highlight: "rgba(255,255,255,0.10)",
  },
  tint: {
    blue: { start: "rgba(59,130,246,0.18)", end: "rgba(59,130,246,0.04)" },
    green: { start: "rgba(16,185,129,0.18)", end: "rgba(16,185,129,0.04)" },
    amber: { start: "rgba(245,158,11,0.18)", end: "rgba(245,158,11,0.04)" },
    rose: { start: "rgba(239,68,68,0.18)", end: "rgba(239,68,68,0.04)" },
  },
  text: {
    primary: "#FFFFFF",
    secondary: "rgba(255,255,255,0.60)",
    tertiary: "rgba(255,255,255,0.38)",
  },
  radius: {
    card: 20,
    btn: 14,
    chip: 20,
    sheet: 24,
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  },
};

// ─── Utility ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStockStatus(item: StockItem): StatusType {
  if (item.quantity === 0) return "critical";
  if (item.quantity < (item.min_threshold || 10)) return "watch";
  return "optimal";
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function StockScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const colors = Colors[theme];
  const insets = useSafeAreaInsets();

  // ── State ────────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [movementType, setMovementType] = useState<"add" | "remove">("add");

  // Barcode state
  const [barcodeInfo, setBarcodeInfo] = useState<{
    barcode: string;
    barcode_format: string | null;
    qr_code_data: string | null;
    item_name: string;
    item_code: string;
  } | null>(null);
  const [isLoadingBarcode, setIsLoadingBarcode] = useState(false);

  // Add form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formMinThreshold, setFormMinThreshold] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Movement form state
  const [moveQty, setMoveQty] = useState("");
  const [moveNotes, setMoveNotes] = useState("");
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  // ── Computed ────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.item_code || "").toLowerCase().includes(q),
      );
    }
    if (selectedCategory) {
      result = result.filter((i) => i.category === selectedCategory);
    }
    return result;
  }, [items, searchQuery, selectedCategory]);

  const stats = useMemo(() => {
    const total = items.length;
    const lowStock = items.filter(
      (i) => i.quantity > 0 && i.quantity < (i.min_threshold || 10),
    ).length;
    const outOfStock = items.filter((i) => i.quantity === 0).length;
    const totalValue = items.reduce(
      (sum, i) => sum + i.quantity * (i.unit_price || 0),
      0,
    );
    return { total, lowStock, outOfStock, totalValue };
  }, [items]);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await stockService.getStockItems(propertyId, {
        search: searchQuery || undefined,
        category: selectedCategory || undefined,
      });
      if (res.success && res.data) {
        setItems(res.data as StockItem[]);
        const cats = [...new Set(res.data.map((i: any) => i.category).filter(Boolean))];
        setCategories(cats as string[]);
      } else {
        console.error("[Stock] getStockItems error:", res.error);
      }
    } catch (err) {
      console.error("Error fetching stock items:", err);
    }
  }, [propertyId]);

  const fetchMovements = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await stockService.getMovements(propertyId);
      if (res.success && res.data) {
        setMovements(res.data as StockMovement[]);
      } else {
        console.error("[Stock] getMovements error:", res.error);
      }
    } catch (err) {
      console.error("Error fetching movements:", err);
    }
  }, [propertyId]);

  const fetchAll = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        await Promise.all([fetchItems(), fetchMovements()]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetchItems, fetchMovements],
  );

  const { refetch } = useDashboardFetch(queryKeys.property.stock(propertyId), fetchAll, {
    staleTime: 1000 * 60 * 5,
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleItemPress = (item: StockItem) => {
    setSelectedItem(item);
    setShowDetailSheet(true);
  };

  const handleAddItem = async () => {
    if (!formName.trim() || !formQuantity.trim() || !propertyId) {
      Alert.alert("Error", "Please fill in required fields");
      return;
    }
    setIsSaving(true);
    try {
      const res = await stockService.createItem({
        propertyId,
        name: formName.trim(),
        item_code: formCode.trim() || undefined,
        category: formCategory.trim() || undefined,
        quantity: parseInt(formQuantity) || 0,
        min_threshold: parseInt(formMinThreshold) || 10,
        unit: formUnit.trim() || undefined,
        unit_price: parseFloat(formPrice) || undefined,
      });
      if (!res.success) throw new Error(res.error || "Failed to add item");
      setShowAddModal(false);
      resetForm();
      await fetchItems();
      Alert.alert("Success", "Asset added successfully");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to add item");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordMovement = async () => {
    if (!selectedItem || !moveQty.trim() || !propertyId) {
      Alert.alert("Error", "Please fill in quantity");
      return;
    }
    const qty = parseInt(moveQty);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Error", "Quantity must be a positive number");
      return;
    }
    if (movementType === "remove" && qty > selectedItem.quantity) {
      Alert.alert("Error", "Cannot remove more than available quantity");
      return;
    }
    setIsSubmittingMovement(true);
    try {
      const qtyChange = movementType === "add" ? qty : -qty;
      const qtyAfter = selectedItem.quantity + qtyChange;

      const res = await stockService.recordMovement({
        propertyId: propertyId as string,
        itemId: selectedItem.id,
        action: movementType,
        quantityChange: qtyChange,
        quantityBefore: selectedItem.quantity,
        quantityAfter: qtyAfter,
        notes: moveNotes.trim() || `Stock ${movementType === "add" ? "In" : "Out"}`,
        userId: user?.id || undefined,
      });

      if (!res.success) throw new Error(res.error || "Failed to record movement");

      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedItem.id ? { ...i, quantity: qtyAfter } : i,
        ),
      );
      setSelectedItem((prev) =>
        prev ? { ...prev, quantity: qtyAfter } : null,
      );
      setShowMovementModal(false);
      setMoveQty("");
      setMoveNotes("");
      await fetchMovements();
      Alert.alert("Success", "Stock movement recorded");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record movement");
    } finally {
      setIsSubmittingMovement(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormCode("");
    setFormCategory("");
    setFormQuantity("");
    setFormMinThreshold("");
    setFormUnit("");
    setFormPrice("");
  };

  const openMovementSheet = (item: StockItem, type: "add" | "remove") => {
    setSelectedItem(item);
    setMovementType(type);
    setShowDetailSheet(false);
    setShowMovementModal(true);
  };

  const handleShowQR = async (item: StockItem) => {
    setShowDetailSheet(false);
    setShowQRModal(true);
    setIsLoadingBarcode(true);
    try {
      const res = await stockService.getBarcode(item.id);
      if (res.success && res.data) {
        setBarcodeInfo(res.data);
      } else {
        setBarcodeInfo(null);
      }
    } catch (err) {
      console.error("Error fetching barcode:", err);
      setBarcodeInfo(null);
    } finally {
      setIsLoadingBarcode(false);
    }
  };

  const handleRegenerateBarcode = async () => {
    if (!selectedItem) return;
    setIsLoadingBarcode(true);
    try {
      const res = await stockService.regenerateBarcode(selectedItem.id);
      if (res.success && res.data) {
        setBarcodeInfo(res.data);
        // Update the item in the list with new barcode
        setItems((prev) =>
          prev.map((i) =>
            i.id === selectedItem.id
              ? { ...i, barcode: res.data?.barcode, qr_code_data: res.data?.qr_code_data }
              : i,
          ),
        );
        Alert.alert("Success", "Barcode regenerated");
      } else {
        throw new Error(res.error || "Failed to regenerate barcode");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to regenerate barcode");
    } finally {
      setIsLoadingBarcode(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading && items.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <LinearGradient
          colors={[...TOKENS.bg.gradient]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading stock...</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 12) + 90,
        },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[...TOKENS.bg.gradient]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ── */}
      <Animated.View
        entering={FadeInUp.duration(400)}
        style={styles.headerWrap}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Stock Management</Text>
            <Text style={styles.headerSubtitle}>Inventory Management</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() =>
                router.push(`/property/${propertyId}/stock/scan` as any)
              }
              activeOpacity={0.7}
            >
              <Scan size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {}}
              activeOpacity={0.7}
            >
              <History size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.headerIconBtn,
                {
                  backgroundColor: "rgba(59,130,246,0.35)",
                  borderColor: "rgba(59,130,246,0.45)",
                },
              ]}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.7}
            >
              <Plus size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── KPI Tinted Glass Cards ── */}
      <Animated.View
        entering={FadeInUp.delay(100).duration(500)}
        style={styles.kpiWrap}
      >
        <View style={styles.kpiRow}>
          <TintedGlassCard
            label="Total items"
            value={stats.total}
            icon={<Package size={16} color="#60A5FA" />}
            tint="blue"
            delay={0}
          />
          <TintedGlassCard
            label="Low stock"
            value={stats.lowStock}
            icon={<AlertTriangle size={16} color="#FBBF24" />}
            tint="amber"
            delay={80}
          />
        </View>
        <View style={styles.kpiRow}>
          <TintedGlassCard
            label="Out of stock"
            value={stats.outOfStock}
            icon={<TrendingDown size={16} color="#FCA5A5" />}
            tint="rose"
            delay={160}
          />
          <TintedGlassCard
            label="Total value"
            value={formatCurrency(stats.totalValue).replace("₹", "₹")}
            icon={<Package size={16} color="#6EE7B7" />}
            tint="green"
            isCurrency
            delay={240}
          />
        </View>
      </Animated.View>

      {/* ── Search + Filter ── */}
      <Animated.View
        entering={FadeInUp.delay(300).duration(500)}
        style={styles.searchWrap}
      >
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Search size={16} color={TOKENS.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search stock..."
              placeholderTextColor={TOKENS.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X size={14} color={TOKENS.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              selectedCategory ? { borderColor: "rgba(59,130,246,0.40)" } : {},
            ]}
            onPress={() => setShowCategoryFilter(!showCategoryFilter)}
          >
            <Filter
              size={16}
              color={selectedCategory ? "#60A5FA" : TOKENS.text.secondary}
            />
          </TouchableOpacity>
        </View>

        {showCategoryFilter && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
          >
            <TouchableOpacity
              style={[
                styles.categoryChip,
                selectedCategory === "" && styles.categoryChipActive,
              ]}
              onPress={() => {
                setSelectedCategory("");
                setShowCategoryFilter(false);
              }}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === "" && styles.categoryChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat && styles.categoryChipActive,
                ]}
                onPress={() => {
                  setSelectedCategory(cat);
                  setShowCategoryFilter(false);
                }}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {selectedCategory ? (
          <View style={styles.activeFilter}>
            <Text style={styles.activeFilterText}>{selectedCategory}</Text>
            <TouchableOpacity onPress={() => setSelectedCategory("")}>
              <X size={12} color={TOKENS.text.tertiary} />
            </TouchableOpacity>
          </View>
        ) : null}
      </Animated.View>

      {/* ── Item List ── */}
      <FlashList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#3B82F6"
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={120}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Package size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedCategory
                ? "Try adjusting your filters"
                : "Tap + to add your first item"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <StockItemCard item={item} onPress={() => handleItemPress(item)} />
        )}
      />

      {/* ── Add Item Modal ── */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <LinearGradient
                colors={["#1a2e3b", "#0f1f2a"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Stock Item</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  <X size={20} color="rgba(255,255,255,0.50)" />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.inputLabel}>Item name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Hydraulic Fluid"
                  placeholderTextColor={TOKENS.text.tertiary}
                  value={formName}
                  onChangeText={setFormName}
                />
                <Text style={styles.inputLabel}>SKU / Item code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. SKU-001"
                  placeholderTextColor={TOKENS.text.tertiary}
                  value={formCode}
                  onChangeText={setFormCode}
                />
                <Text style={styles.inputLabel}>Category</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Lubricants"
                  placeholderTextColor={TOKENS.text.tertiary}
                  value={formCategory}
                  onChangeText={setFormCategory}
                />
                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Initial qty *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor={TOKENS.text.tertiary}
                      keyboardType="numeric"
                      value={formQuantity}
                      onChangeText={setFormQuantity}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Min threshold</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="10"
                      placeholderTextColor={TOKENS.text.tertiary}
                      keyboardType="numeric"
                      value={formMinThreshold}
                      onChangeText={setFormMinThreshold}
                    />
                  </View>
                </View>
                <View style={styles.rowInputs}>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Unit</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="litres, kg, pcs"
                      placeholderTextColor={TOKENS.text.tertiary}
                      value={formUnit}
                      onChangeText={setFormUnit}
                    />
                  </View>
                  <View style={styles.halfInput}>
                    <Text style={styles.inputLabel}>Unit price (₹)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor={TOKENS.text.tertiary}
                      keyboardType="decimal-pad"
                      value={formPrice}
                      onChangeText={setFormPrice}
                    />
                  </View>
                </View>
              </ScrollView>
              <TouchableOpacity
                style={[styles.submitBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleAddItem}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Stock Item</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Item Detail Bottom Sheet ── */}
      <Modal visible={showDetailSheet} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => setShowDetailSheet(false)}
          />
          <View style={styles.detailSheet}>
            <LinearGradient
              colors={["#1a2e3b", "#0f1f2a"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.modalHandle} />
            {selectedItem && (
              <>
                <View style={styles.detailHeader}>
                  <View style={styles.detailTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailItemName}>
                        {selectedItem.name}
                      </Text>
                      <Text style={styles.detailMeta}>
                        {selectedItem.item_code || "No SKU"} ·{" "}
                        {selectedItem.category || "Uncategorized"}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowDetailSheet(false)}>
                      <X size={20} color="rgba(255,255,255,0.50)" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.detailStatsRow}>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatValue}>
                      {selectedItem.quantity}
                    </Text>
                    <Text style={styles.detailStatLabel}>Current qty</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatValue}>
                      {selectedItem.min_threshold || 10}
                    </Text>
                    <Text style={styles.detailStatLabel}>Min threshold</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatValue}>
                      {selectedItem.unit || "-"}
                    </Text>
                    <Text style={styles.detailStatLabel}>Unit</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <Text style={styles.detailStatValue}>
                      {formatCurrency(selectedItem.unit_price || 0)}
                    </Text>
                    <Text style={styles.detailStatLabel}>Unit price</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.valueBanner,
                    { backgroundColor: "rgba(59,130,246,0.12)" },
                  ]}
                >
                  <Text
                    style={[
                      styles.valueBannerLabel,
                      { color: TOKENS.text.secondary },
                    ]}
                  >
                    Total value
                  </Text>
                  <Text style={[styles.valueBannerValue, { color: "#60A5FA" }]}>
                    {formatCurrency(
                      selectedItem.quantity * (selectedItem.unit_price || 0),
                    )}
                  </Text>
                </View>
                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { backgroundColor: "rgba(16,185,129,0.15)" },
                    ]}
                    onPress={() => openMovementSheet(selectedItem, "add")}
                  >
                    <ArrowUpCircle size={20} color="#34D399" />
                    <Text style={[styles.actionBtnText, { color: "#34D399" }]}>
                      Add stock
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { backgroundColor: "rgba(239,68,68,0.15)" },
                    ]}
                    onPress={() => openMovementSheet(selectedItem, "remove")}
                  >
                    <ArrowDownCircle size={20} color="#FCA5A5" />
                    <Text style={[styles.actionBtnText, { color: "#FCA5A5" }]}>
                      Remove stock
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.qrBtn,
                    { borderColor: "rgba(255,255,255,0.10)" },
                  ]}
                  onPress={() => handleShowQR(selectedItem)}
                >
                  <QrCode size={18} color={TOKENS.text.secondary} />
                  <Text
                    style={[styles.qrBtnText, { color: TOKENS.text.secondary }]}
                  >
                    Show barcode / QR
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Stock Movement Modal ── */}
      <Modal visible={showMovementModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <LinearGradient
                colors={["#1a2e3b", "#0f1f2a"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {movementType === "add" ? "Add" : "Remove"} stock
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowMovementModal(false);
                    setMoveQty("");
                    setMoveNotes("");
                  }}
                >
                  <X size={20} color="rgba(255,255,255,0.50)" />
                </TouchableOpacity>
              </View>
              {selectedItem && (
                <ScrollView
                  style={styles.modalBody}
                  showsVerticalScrollIndicator={false}
                >
                  <View
                    style={[
                      styles.moveItemBanner,
                      {
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderColor: "rgba(255,255,255,0.08)",
                      },
                    ]}
                  >
                    <Text style={styles.moveItemName}>{selectedItem.name}</Text>
                    <Text
                      style={[
                        styles.moveItemQty,
                        { color: TOKENS.text.secondary },
                      ]}
                    >
                      Current: {selectedItem.quantity}{" "}
                      {selectedItem.unit || "units"}
                    </Text>
                  </View>
                  <View style={styles.movementToggle}>
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        movementType === "add"
                          ? {
                              backgroundColor: "rgba(16,185,129,0.18)",
                              borderColor: "rgba(16,185,129,0.30)",
                            }
                          : {
                              backgroundColor: "rgba(255,255,255,0.05)",
                              borderColor: "rgba(255,255,255,0.08)",
                            },
                      ]}
                      onPress={() => setMovementType("add")}
                    >
                      <ArrowUpCircle
                        size={16}
                        color={
                          movementType === "add"
                            ? "#34D399"
                            : TOKENS.text.tertiary
                        }
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          {
                            color:
                              movementType === "add"
                                ? "#34D399"
                                : TOKENS.text.tertiary,
                          },
                        ]}
                      >
                        Add
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        movementType === "remove"
                          ? {
                              backgroundColor: "rgba(239,68,68,0.18)",
                              borderColor: "rgba(239,68,68,0.30)",
                            }
                          : {
                              backgroundColor: "rgba(255,255,255,0.05)",
                              borderColor: "rgba(255,255,255,0.08)",
                            },
                      ]}
                      onPress={() => setMovementType("remove")}
                    >
                      <ArrowDownCircle
                        size={16}
                        color={
                          movementType === "remove"
                            ? "#FCA5A5"
                            : TOKENS.text.tertiary
                        }
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          {
                            color:
                              movementType === "remove"
                                ? "#FCA5A5"
                                : TOKENS.text.tertiary,
                          },
                        ]}
                      >
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.inputLabel}>Quantity *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter quantity"
                    placeholderTextColor={TOKENS.text.tertiary}
                    keyboardType="numeric"
                    value={moveQty}
                    onChangeText={setMoveQty}
                  />
                  {movementType === "remove" && selectedItem && (
                    <Text
                      style={[
                        styles.helperText,
                        { color: TOKENS.text.tertiary },
                      ]}
                    >
                      Available: {selectedItem.quantity}{" "}
                      {selectedItem.unit || "units"}
                    </Text>
                  )}
                  <Text style={styles.inputLabel}>Notes / reason</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Optional notes..."
                    placeholderTextColor={TOKENS.text.tertiary}
                    multiline
                    numberOfLines={3}
                    value={moveNotes}
                    onChangeText={setMoveNotes}
                  />
                </ScrollView>
              )}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor:
                      movementType === "add" ? "#10B981" : "#EF4444",
                  },
                  isSubmittingMovement && { opacity: 0.6 },
                ]}
                onPress={handleRecordMovement}
                disabled={isSubmittingMovement}
              >
                {isSubmittingMovement ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {movementType === "add" ? "Add stock" : "Remove stock"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── QR Modal ── */}
      <Modal visible={showQRModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.qrModal}>
            <LinearGradient
              colors={["#1a2e3b", "#0f1f2a"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Item QR / Barcode</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <X size={20} color="rgba(255,255,255,0.50)" />
              </TouchableOpacity>
            </View>
            {isLoadingBarcode ? (
              <View style={styles.qrContent}>
                <ActivityIndicator color="#3B82F6" />
                <Text style={[styles.qrCategory, { marginTop: 12 }]}>
                  Loading barcode...
                </Text>
              </View>
            ) : barcodeInfo ? (
              <View style={styles.qrContent}>
                <View style={styles.qrPlaceholder}>
                  <QrCode size={64} color="rgba(255,255,255,0.20)" />
                  <Text style={[styles.qrItemCode, { color: TOKENS.text.tertiary }]}>
                    {barcodeInfo.barcode || selectedItem?.item_code || selectedItem?.id}
                  </Text>
                </View>
                <Text style={[styles.qrName, { color: TOKENS.text.primary }]}>
                  {barcodeInfo.item_name || selectedItem?.name}
                </Text>
                <Text style={[styles.qrCategory, { color: TOKENS.text.secondary }]}>
                  {selectedItem?.category || "Uncategorized"}
                </Text>
                {barcodeInfo.qr_code_data && (
                  <Text
                    style={[
                      styles.qrCategory,
                      {
                        color: TOKENS.text.tertiary,
                        fontSize: 10,
                        marginTop: 8,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {barcodeInfo.qr_code_data}
                  </Text>
                )}
                <View style={styles.qrActions}>
                  <TouchableOpacity
                    style={[styles.qrActionBtn, { backgroundColor: "rgba(59,130,246,0.15)" }]}
                    onPress={handleRegenerateBarcode}
                    disabled={isLoadingBarcode}
                  >
                    <RefreshCw size={14} color="#60A5FA" />
                    <Text style={[styles.qrActionText, { color: "#60A5FA" }]}>
                      Regenerate
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.qrContent}>
                <Text style={[styles.qrCategory, { color: TOKENS.text.secondary }]}>
                  No barcode info available
                </Text>
                {selectedItem && (
                  <TouchableOpacity
                    style={[styles.qrActionBtn, { backgroundColor: "rgba(59,130,246,0.15)", marginTop: 16 }]}
                    onPress={handleRegenerateBarcode}
                    disabled={isLoadingBarcode}
                  >
                    <RefreshCw size={14} color="#60A5FA" />
                    <Text style={[styles.qrActionText, { color: "#60A5FA" }]}>
                      Generate Barcode
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Stock Item Card (memoized for FlashList) ─────────────────────────────────

interface StockItemCardProps {
  item: StockItem;
  onPress: (item: StockItem) => void;
}

const StockItemCard = React.memo(function StockItemCard({
  item,
  onPress,
}: StockItemCardProps) {
  const status = getStockStatus(item);
  const palette = STATUS_COLORS[status];

  return (
    <TouchableOpacity
      style={[styles.itemCard, { borderLeftColor: palette.bg }]}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      <SafeBlurView
        intensity={35}
        style={StyleSheet.absoluteFillObject}
        tint="dark"
      />
      <LinearGradient
        colors={[
          "rgba(255,255,255,0.10)",
          "rgba(255,255,255,0.03)",
          "rgba(0,0,0,0.20)",
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.itemRow}>
        <View
          style={[styles.itemIconWrap, { backgroundColor: palette.surface }]}
        >
          <Package size={20} color={palette.bg} />
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {item.item_code || "No SKU"} · {item.category || "Uncategorized"}
          </Text>
        </View>
        <View style={styles.itemRight}>
          <Text style={[styles.qtyValue, { color: palette.text }]}>
            {item.quantity}
          </Text>
          <Text style={styles.itemUnit}>{item.unit || "units"}</Text>
        </View>
        <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
      </View>
    </TouchableOpacity>
  );
});

// ─── Tinted Glass Card Sub-component ──────────────────────────────────────────

function TintedGlassCard({
  label,
  value,
  icon,
  tint,
  isCurrency,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tint: "blue" | "green" | "amber" | "rose";
  isCurrency?: boolean;
  delay?: number;
}) {
  const tintDef = TOKENS.tint[tint];

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(500)}
      style={{ flex: 1 }}
    >
      <View style={[styles.tintedCard, TOKENS.shadow.card]}>
        <SafeBlurView
          intensity={40}
          style={StyleSheet.absoluteFillObject}
          tint="dark"
        />
        <LinearGradient
          colors={[
            tintDef.start,
            TOKENS.glass.bg,
            tintDef.end,
            "rgba(0,0,0,0.15)",
          ]}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.tintedCardInner}>
          <View style={styles.tintedCardHeader}>
            <View
              style={[
                styles.tintedIconWrap,
                { backgroundColor: "rgba(255,255,255,0.10)" },
              ]}
            >
              {icon}
            </View>
            <Text style={styles.tintedLabel}>{label}</Text>
          </View>
          <Text
            style={[styles.tintedValue, isCurrency && { fontSize: 20 }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </View>
    </Animated.View>
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
  loadingText: {
    fontSize: 14,
    fontFamily: "Urbanist-Medium",
    color: TOKENS.text.secondary,
  },

  // Header
  headerWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: TOKENS.text.secondary,
    marginTop: 2,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: TOKENS.radius.btn,
    backgroundColor: TOKENS.glass.bg,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    justifyContent: "center",
    alignItems: "center",
  },

  // KPI Tinted Glass Cards
  kpiWrap: { paddingHorizontal: 20, gap: 10, marginBottom: 18 },
  kpiRow: { flexDirection: "row", gap: 10 },
  tintedCard: {
    borderRadius: TOKENS.radius.card,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    overflow: "hidden",
    minHeight: 110,
  },
  tintedCardInner: { padding: 14, position: "relative", zIndex: 1 },
  tintedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  tintedIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  tintedLabel: {
    fontFamily: "Urbanist-Bold",
    fontSize: 11,
    color: TOKENS.text.secondary,
    letterSpacing: 0.8,
    textTransform: "capitalize",
  },
  tintedValue: {
    fontFamily: "Poppins-Bold",
    fontSize: 28,
    color: TOKENS.text.primary,
    letterSpacing: -0.5,
  },

  // Search
  searchWrap: { paddingHorizontal: 20, marginBottom: 14 },
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: TOKENS.radius.card,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    backgroundColor: TOKENS.glass.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.primary,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: TOKENS.radius.card,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    backgroundColor: TOKENS.glass.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  chipScroll: { paddingRight: 20, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: TOKENS.radius.chip,
    backgroundColor: TOKENS.glass.bg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  categoryChipActive: {
    backgroundColor: "rgba(59,130,246,0.20)",
    borderColor: "rgba(59,130,246,0.40)",
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: TOKENS.text.secondary,
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
    fontFamily: "Urbanist-Bold",
  },
  activeFilter: { flexDirection: "row", alignItems: "center", gap: 6 },
  activeFilterText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: TOKENS.text.secondary,
  },

  // List
  listContent: { paddingHorizontal: 20, paddingBottom: 120 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.secondary,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.tertiary,
    textAlign: "center",
  },

  itemCard: {
    borderRadius: TOKENS.radius.card,
    borderLeftWidth: 3,
    overflow: "hidden",
    marginBottom: 10,
    ...TOKENS.shadow.card,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: { flex: 1 },
  itemName: {
    fontSize: 15,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
    marginBottom: 3,
  },
  itemMeta: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.tertiary,
  },
  itemRight: { alignItems: "flex-end", marginRight: 4 },
  qtyValue: {
    fontSize: 22,
    fontFamily: "Poppins-Bold",
  },
  itemUnit: {
    fontSize: 10,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.tertiary,
    marginTop: 1,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.60)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: TOKENS.radius.sheet,
    borderTopRightRadius: TOKENS.radius.sheet,
    paddingHorizontal: 20,
    paddingBottom: 34,
    overflow: "hidden",
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
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
  modalTitle: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
  },
  modalBody: { maxHeight: 400 },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    textTransform: "capitalize",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
    color: TOKENS.text.secondary,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.glass.border,
    backgroundColor: TOKENS.glass.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.primary,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  rowInputs: { flexDirection: "row", gap: 12 },
  halfInput: { flex: 1 },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "#3B82F6",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Poppins-Bold",
  },

  // Detail Sheet
  detailSheet: {
    borderTopLeftRadius: TOKENS.radius.sheet,
    borderTopRightRadius: TOKENS.radius.sheet,
    paddingHorizontal: 20,
    paddingBottom: 34,
    overflow: "hidden",
  },
  detailHeader: { marginBottom: 16 },
  detailTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  detailItemName: {
    fontSize: 20,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
    flex: 1,
    marginRight: 16,
  },
  detailMeta: {
    fontSize: 13,
    fontFamily: "Urbanist-Regular",
    color: TOKENS.text.tertiary,
    marginTop: 4,
  },
  detailStatsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  detailStatCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  detailStatValue: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
  },
  detailStatLabel: {
    fontSize: 9,
    fontFamily: "Urbanist-Medium",
    textTransform: "capitalize",
    letterSpacing: 0.3,
    color: TOKENS.text.tertiary,
    marginTop: 3,
  },
  valueBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  valueBannerLabel: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
  },
  valueBannerValue: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
  },
  actionBtns: { flexDirection: "row", gap: 12, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "Poppins-Bold",
  },
  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  qrBtnText: {
    fontSize: 13,
    fontFamily: "Urbanist-Medium",
  },

  // Movement
  moveItemBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  moveItemName: {
    fontSize: 16,
    fontFamily: "Poppins-Bold",
    color: TOKENS.text.primary,
  },
  moveItemQty: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    marginTop: 2,
  },
  movementToggle: { flexDirection: "row", gap: 12, marginBottom: 16 },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
  },
  toggleBtnText: {
    fontSize: 14,
    fontFamily: "Poppins-Bold",
  },
  helperText: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    marginTop: 4,
    marginBottom: 8,
  },

  // QR Modal
  qrModal: {
    borderRadius: TOKENS.radius.sheet,
    paddingHorizontal: 20,
    paddingBottom: 34,
    alignItems: "center",
    margin: 24,
    overflow: "hidden",
  },
  qrContent: { alignItems: "center", paddingVertical: 20 },
  qrPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  qrItemCode: {
    fontSize: 11,
    fontFamily: "Urbanist-Medium",
    marginTop: 10,
    letterSpacing: 1,
  },
  qrName: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    marginTop: 4,
  },
  qrCategory: {
    fontSize: 13,
    fontFamily: "Urbanist-Regular",
    marginTop: 4,
  },
  qrActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  qrActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  qrActionText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
  },
});
