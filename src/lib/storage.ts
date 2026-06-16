import { categoryLabels, highlights } from "../data/highlights";
import type { PlannerSettings, TravelStyle, TripDirection } from "../types";

const STORAGE_KEY = "norway-flexible-roadtrip-planner:v1";

export const defaultSettings: PlannerSettings = {
  currentHighlightId: "kristiansand",
  dayStyle: "scenic",
  maxDriveHours: 3,
  tripDirection: "outbound",
  enabledCategories: Object.keys(categoryLabels) as PlannerSettings["enabledCategories"],
  ev: {
    practicalRangeKm: 420,
    safetyMarginPercent: 18,
    minArrivalBatteryPercent: 15,
    maxDistanceWithoutChargingKm: 280,
  },
  recentlyViewedHighlightIds: [],
};

function normalizeDayStyle(dayStyle: Partial<PlannerSettings>["dayStyle"]): TravelStyle {
  if (dayStyle === "rustig" || dayStyle === "actief" || dayStyle === "scenic" || dayStyle === "slechtweer") {
    return dayStyle;
  }
  if (dayStyle === "stad" || dayStyle === "cultuur") return "slechtweer";
  if (dayStyle === "natuur") return "scenic";
  return defaultSettings.dayStyle;
}

function normalizeTripDirection(value: Partial<PlannerSettings>["tripDirection"]): TripDirection {
  if (value === "outbound" || value === "flexible" || value === "returning") return value;
  return defaultSettings.tripDirection;
}

export function loadSettings(): PlannerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw) as Partial<PlannerSettings>;
    const highlightExists = highlights.some((item) => item.id === parsed.currentHighlightId);

    return {
      ...defaultSettings,
      ...parsed,
      currentHighlightId: highlightExists ? parsed.currentHighlightId! : defaultSettings.currentHighlightId,
      dayStyle: normalizeDayStyle(parsed.dayStyle),
      tripDirection: normalizeTripDirection(parsed.tripDirection),
      ev: {
        ...defaultSettings.ev,
        ...parsed.ev,
      },
      enabledCategories: parsed.enabledCategories?.length
        ? parsed.enabledCategories
        : defaultSettings.enabledCategories,
      recentlyViewedHighlightIds: parsed.recentlyViewedHighlightIds ?? [],
      customStart: parsed.customStart,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: PlannerSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
