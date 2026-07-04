export type Category =
  | "city"
  | "fjord"
  | "hike"
  | "stave_church"
  | "kayak"
  | "viewpoint"
  | "scenic_route";

export type Importance = "must-see" | "aanbevolen" | "optioneel";

export type TravelStyle =
  | "rustig"
  | "actief"
  | "natuur"
  | "stad"
  | "cultuur"
  | "scenic"
  | "slechtweer";

export type TripDirection = "outbound" | "flexible" | "returning";
export type PersonalMapLayer = "favorites" | "completed" | "sleepBases";

export interface Highlight {
  id: string;
  name: string;
  category: Category;
  region: string;
  description: string;
  lat: number;
  lng: number;
  navigationLat?: number;
  navigationLng?: number;
  navigationLabel?: string;
  navigationNote?: string;
  visitTimeHours: number;
  importance: Importance;
  styles: TravelStyle[];
  note?: string;
  detail?: string[];
  contentTips?: {
    bestMoment: string;
    skipWhen: string;
    fits: string[];
    logistics: string;
  };
  imageUrl?: string;
  imageAlt?: string;
  imageCredit?: string;
}

export interface SleepBase {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  description: string;
  bestFor: string[];
  tripMoment: string;
  dayTrips: string[];
  note: string;
}

export interface EvSettings {
  practicalRangeKm: number;
  safetyMarginPercent: number;
  minArrivalBatteryPercent: number;
  maxDistanceWithoutChargingKm: number;
}

export interface PlannerSettings {
  currentHighlightId: string;
  customStart?: {
    lat: number;
    lng: number;
    name: string;
  };
  dayStyle: TravelStyle;
  maxDriveHours: number;
  tripDirection: TripDirection;
  enabledCategories: Category[];
  enabledPersonalLayers: PersonalMapLayer[];
  mapFocusMode: boolean;
  ev: EvSettings;
  priorityHighlightIds: string[];
  completedHighlightIds: string[];
  recentlyViewedHighlightIds: string[];
  savedTodayOptionId?: string;
}

export interface RouteStop {
  highlight: Highlight;
  distanceFromStartKm: number;
}

export interface OfflineRouteLabel {
  label: string;
  description: string;
  tone: "good" | "watch" | "caution" | "neutral";
}

export type RouteOptionKind =
  | "kort"
  | "actief"
  | "scenic"
  | "doorreis"
  | "verder"
  | "slechtweer"
  | "blijven";

export interface RouteOption {
  id: string;
  kind: RouteOptionKind;
  title: string;
  guideText: string;
  rankingReason: string;
  whenToChoose: string;
  alternative: string;
  estimatedDriveHours: number;
  estimatedDistanceKm: number;
  routeSource: "osrm" | "estimated";
  routePath?: Array<[number, number]>;
  stops: RouteStop[];
  suggestedSleepBase?: {
    name: string;
    region: string;
    distanceKm: number;
    reason: string;
  };
  activityType: string;
  offlineLabels: OfflineRouteLabel[];
  score: number;
  scoreBreakdown: {
    driveTime: number;
    activitySpread: number;
    mustSee: number;
    evRisk: number;
    rhythm: number;
  };
  scoreNotes: string[];
  fitsDriveWindow: boolean;
  warnings: string[];
  evMessage: string;
  evLevel: "ok" | "watch" | "caution";
}
