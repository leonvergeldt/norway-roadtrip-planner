export type Category =
  | "city"
  | "fjord"
  | "hike"
  | "stave_church"
  | "kayak"
  | "viewpoint"
  | "scenic_route"
  | "ferry_route";

export type Importance = "must-see" | "aanbevolen" | "optioneel";

export type TravelStyle =
  | "rustig"
  | "actief"
  | "natuur"
  | "stad"
  | "cultuur"
  | "scenic"
  | "slechtweer";

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
  enabledCategories: Category[];
  ev: EvSettings;
  recentlyViewedHighlightIds: string[];
  savedTodayOptionId?: string;
}

export interface RouteStop {
  highlight: Highlight;
  distanceFromStartKm: number;
}

export type RouteOptionKind =
  | "kort"
  | "actief"
  | "scenic"
  | "doorreis"
  | "slechtweer";

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
  activityType: string;
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
