import { Fragment, Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, Polyline, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import type { Marker as LeafletMarker, LatLngExpression } from "leaflet";
import {
  Binoculars,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  Footprints,
  Home,
  LocateFixed,
  Layers,
  MapPinned,
  RotateCcw,
  Route,
  Search,
  Settings2,
  Sparkles,
  Star,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { HighlightImage } from "./components/HighlightImage";
import { categoryColors, categoryLabels, highlights } from "./data/highlights";
import { sleepBases } from "./data/sleepBases";
import { defaultSettings, loadSettings, saveSettings } from "./lib/storage";
import type { Category, Highlight, PersonalMapLayer, PlannerSettings, RouteOption, SleepBase, TravelStyle, TripDirection } from "./types";

const RouteOptionCard = lazy(() =>
  import("./components/RouteOptionCard").then((module) => ({ default: module.RouteOptionCard })),
);

const dayStyles: Array<{ value: TravelStyle; label: string }> = [
  { value: "rustig", label: "Rustig" },
  { value: "actief", label: "Actief" },
  { value: "scenic", label: "Natuur/scenic" },
  { value: "slechtweer", label: "Stad/regen" },
];

const tripDirections: Array<{ value: TripDirection; label: string }> = [
  { value: "outbound", label: "Heen" },
  { value: "flexible", label: "Vrij" },
  { value: "returning", label: "Terug" },
];

const mapLayerGroups: Array<{
  id: string;
  label: string;
  categories: Category[];
  color: string;
  icon: LucideIcon;
}> = [
  { id: "city-culture", label: "Stad & cultuur", categories: ["city", "stave_church"], color: "#2563eb", icon: Building2 },
  { id: "fjords-water", label: "Fjord & water", categories: ["fjord", "kayak"], color: "#0284c7", icon: Waves },
  { id: "hikes-nature", label: "Hikes & natuur", categories: ["hike"], color: "#15803d", icon: Footprints },
  { id: "views-routes", label: "Uitzicht & routes", categories: ["viewpoint", "scenic_route"], color: "#ea580c", icon: Binoculars },
];

const personalMapLayers: Array<{ id: PersonalMapLayer; label: string; color: string; icon: LucideIcon }> = [
  { id: "favorites", label: "Zeker doen", color: "#ca8a04", icon: Star },
  { id: "sleepBases", label: "Slaapbases", color: "#be123c", icon: Home },
  { id: "completed", label: "Gedaan", color: "#94a3b8", icon: CheckCircle2 },
];

const badWeatherVisibleCategories = new Set<Category>(["city", "stave_church", "scenic_route", "viewpoint"]);
const highlightById = new Map(highlights.map((highlight) => [highlight.id, highlight]));

function compactSearchText(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

const highlightSearchIndex = new Map(
  highlights.map((highlight) => [
    highlight.id,
    compactSearchText([
      highlight.name,
      highlight.region,
      categoryLabels[highlight.category],
      highlight.description,
      highlight.note,
      ...(highlight.detail ?? []),
      highlight.contentTips?.bestMoment,
      highlight.contentTips?.skipWhen,
      highlight.contentTips?.logistics,
      ...(highlight.contentTips?.fits ?? []),
      ...highlight.styles,
      highlight.importance,
    ]),
  ]),
);

const sleepBaseSearchIndex = new Map(
  sleepBases.map((sleepBase) => [
    sleepBase.id,
    compactSearchText([
      sleepBase.name,
      sleepBase.region,
      sleepBase.description,
      sleepBase.tripMoment,
      sleepBase.note,
      ...sleepBase.bestFor,
      ...sleepBase.dayTrips,
    ]),
  ]),
);

type MarkerIconName =
  | "binoculars"
  | "building"
  | "check"
  | "church"
  | "footprints"
  | "home"
  | "mapPin"
  | "navigation"
  | "route"
  | "star"
  | "waves";

const markerIconByCategory: Record<Category, MarkerIconName> = {
  city: "building",
  fjord: "waves",
  hike: "footprints",
  stave_church: "church",
  kayak: "waves",
  viewpoint: "binoculars",
  scenic_route: "route",
};

const markerIconPaths: Record<MarkerIconName, string> = {
  binoculars:
    '<path d="M7 7h3l2 9h-4l-1-4h-2l-1 4h-3l2-7a3 3 0 0 1 3-2Z"/><path d="M17 7h-3l-2 9h4l1-4h2l1 4h3l-2-7a3 3 0 0 0-3-2Z"/><path d="M10 7h4"/><path d="M8 16a2 2 0 1 1-4 0"/><path d="M20 16a2 2 0 1 1-4 0"/>',
  building:
    '<path d="M4 21h16"/><path d="M6 21v-15a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15"/><path d="M9 8h1"/><path d="M14 8h1"/><path d="M9 12h1"/><path d="M14 12h1"/><path d="M10 21v-4h4v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  church:
    '<path d="M12 3v18"/><path d="M9 6h6"/><path d="m5 10 7-5 7 5"/><path d="M6 21v-9h12v9"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/>',
  footprints:
    '<path d="M8 7a2 2 0 1 0-3 2c1 1 2 2 2 4"/><path d="M6 17a2 2 0 1 0 4 0c0-2-2-3-3-4"/><path d="M16 5a2 2 0 1 0-3 2c1 1 2 2 2 4"/><path d="M14 15a2 2 0 1 0 4 0c0-2-2-3-3-4"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14v-11"/><path d="M9 21v-6h6v6"/>',
  mapPin: '<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  navigation: '<path d="m12 3 7 18-7-4-7 4 7-18Z"/>',
  route:
    '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h5a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h5"/>',
  star:
    '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  waves:
    '<path d="M3 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M3 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M3 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>',
};

function renderMarkerIconMarkup(iconName: MarkerIconName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${markerIconPaths[iconName]}</svg>`;
}

const mapSymbolIconCache = new Map<string, ReturnType<typeof divIcon>>();
const clusterIconCache = new Map<string, ReturnType<typeof divIcon>>();

function mapSymbolIcon({
  Icon,
  BadgeIcon,
  color,
  active = false,
  muted = false,
  className = "",
}: {
  Icon: MarkerIconName;
  BadgeIcon?: MarkerIconName;
  color: string;
  active?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const cacheKey = [Icon, BadgeIcon ?? "", color, active ? "1" : "0", muted ? "1" : "0", className].join("|");
  const cached = mapSymbolIconCache.get(cacheKey);
  if (cached) return cached;

  const classes = ["map-symbol-marker", active ? "active" : "", muted ? "muted" : "", className]
    .filter(Boolean)
    .join(" ");
  const badge = BadgeIcon ? `<span class="map-symbol-marker__badge">${renderMarkerIconMarkup(BadgeIcon)}</span>` : "";

  const icon = divIcon({
    className: classes,
    html: `<div class="map-symbol-marker__inner" style="--marker-color:${color}">${renderMarkerIconMarkup(Icon)}${badge}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    tooltipAnchor: [0, -18],
  });
  mapSymbolIconCache.set(cacheKey, icon);
  return icon;
}

function clusterMapIcon({
  count,
  hasMustSee,
  hasPriority,
}: {
  count: number;
  hasMustSee: boolean;
  hasPriority: boolean;
}) {
  const cacheKey = `${count}|${hasMustSee ? "1" : "0"}|${hasPriority ? "1" : "0"}`;
  const cached = clusterIconCache.get(cacheKey);
  if (cached) return cached;

  const classes = ["map-cluster-marker", hasMustSee ? "must-see" : "", hasPriority ? "priority" : ""]
    .filter(Boolean)
    .join(" ");

  const icon = divIcon({
    className: classes,
    html: `<div class="map-cluster-marker__inner"><span>${count}</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    tooltipAnchor: [0, -18],
  });
  clusterIconCache.set(cacheKey, icon);
  return icon;
}

function highlightMapIcon({
  highlight,
  isCurrent,
  isSelected,
  isPriority,
  isCompleted,
}: {
  highlight: Highlight;
  isCurrent: boolean;
  isSelected: boolean;
  isPriority: boolean;
  isCompleted: boolean;
}) {
  return mapSymbolIcon({
    Icon: markerIconByCategory[highlight.category],
    BadgeIcon: isCompleted ? "check" : isPriority ? "star" : undefined,
    color: isCompleted ? "#94a3b8" : categoryColors[highlight.category],
    active: isCurrent || isSelected,
    muted: isCompleted,
    className: highlight.importance === "must-see" ? "must-see" : "",
  });
}

function FitRoute({ selectedOption }: { selectedOption?: RouteOption }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedOption) return;
    const points = selectedOption.routePath?.length
      ? selectedOption.routePath
      : selectedOption.stops.map((stop) => getMapPosition(stop.highlight));
    if (!points.length) return;
    map.fitBounds(points as [number, number][], { padding: [60, 60], maxZoom: 9 });
  }, [map, selectedOption]);

  return null;
}

function FocusHighlight({ highlight }: { highlight?: Highlight }) {
  const map = useMap();

  useEffect(() => {
    if (!highlight) return;
    const target: [number, number] = [highlight.lat, highlight.lng];
    const targetZoom = Math.max(map.getZoom(), 8);
    const distanceMeters = map.getCenter().distanceTo(target);

    if (distanceMeters > 120_000) {
      map.setView(target, targetZoom, { animate: false });
      return;
    }

    map.flyTo(target, targetZoom, { duration: 0.45 });
  }, [highlight, map]);

  return null;
}

type GeographicBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type MapViewport = {
  zoom: number;
  bounds?: GeographicBounds;
};

type OfflineDownloadProgress = {
  completed: number;
  total: number;
  failed: number;
  phase: string;
};

function TrackMapViewport({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const map = useMap();

  const reportViewport = useCallback(() => {
    const bounds = map.getBounds();
    onChange({
      zoom: map.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    });
  }, [map, onChange]);

  useEffect(() => {
    reportViewport();
  }, [reportViewport]);

  useMapEvents({
    moveend: reportViewport,
  });

  return null;
}

function MapClickPicker({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick(Number(event.latlng.lat.toFixed(5)), Number(event.latlng.lng.toFixed(5)));
    },
  });

  return null;
}

type HighlightCluster = {
  id: string;
  highlights: Highlight[];
  lat: number;
  lng: number;
  hasMustSee: boolean;
  hasPriority: boolean;
};

function clusterCellSizeForZoom(zoom: number) {
  if (zoom >= 11) return 0;
  if (zoom <= 5) return 1.8;
  if (zoom <= 6) return 1.05;
  if (zoom === 7) return 0.55;
  if (zoom === 8) return 0.28;
  if (zoom === 9) return 0.14;
  return 0.07;
}

function isInsidePaddedViewport(
  point: { lat: number; lng: number },
  bounds: GeographicBounds,
  paddingRatio = 0.3,
) {
  const latitudePadding = (bounds.north - bounds.south) * paddingRatio;
  const longitudePadding = (bounds.east - bounds.west) * paddingRatio;
  return (
    point.lat >= bounds.south - latitudePadding &&
    point.lat <= bounds.north + latitudePadding &&
    point.lng >= bounds.west - longitudePadding &&
    point.lng <= bounds.east + longitudePadding
  );
}

function buildHighlightClusters({
  highlights,
  pinnedIds,
  priorityIds,
  zoom,
  disableClustering,
}: {
  highlights: Highlight[];
  pinnedIds: Set<string>;
  priorityIds: Set<string>;
  zoom: number;
  disableClustering: boolean;
}) {
  const cellSize = disableClustering ? 0 : clusterCellSizeForZoom(zoom);
  if (!cellSize) return { clusters: [] as HighlightCluster[], individualHighlights: highlights };

  const buckets = new Map<string, Highlight[]>();
  const individualHighlights: Highlight[] = [];

  highlights.forEach((highlight) => {
    if (pinnedIds.has(highlight.id)) {
      individualHighlights.push(highlight);
      return;
    }

    const latKey = Math.floor(highlight.lat / cellSize);
    const lngKey = Math.floor(highlight.lng / cellSize);
    const key = `${latKey}:${lngKey}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(highlight);
    } else {
      buckets.set(key, [highlight]);
    }
  });

  const clusters: HighlightCluster[] = [];

  buckets.forEach((bucket, key) => {
    if (bucket.length === 1) {
      individualHighlights.push(bucket[0]);
      return;
    }

    const lat = bucket.reduce((sum, highlight) => sum + highlight.lat, 0) / bucket.length;
    const lng = bucket.reduce((sum, highlight) => sum + highlight.lng, 0) / bucket.length;
    clusters.push({
      id: `cluster-${zoom}-${key}`,
      highlights: bucket,
      lat,
      lng,
      hasMustSee: bucket.some((highlight) => highlight.importance === "must-see"),
      hasPriority: bucket.some((highlight) => priorityIds.has(highlight.id)),
    });
  });

  return { clusters, individualHighlights };
}

function HighlightClusterMarker({ cluster }: { cluster: HighlightCluster }) {
  const map = useMap();
  const label =
    cluster.highlights.length === 1 ? "1 highlight" : `${cluster.highlights.length} highlights`;
  const sampleNames = cluster.highlights
    .slice(0, 4)
    .map((highlight) => highlight.name)
    .join(", ");

  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={clusterMapIcon({
        count: cluster.highlights.length,
        hasMustSee: cluster.hasMustSee,
        hasPriority: cluster.hasPriority,
      })}
      eventHandlers={{
        click: () => {
          const bounds = cluster.highlights.map((highlight) => [highlight.lat, highlight.lng] as [number, number]);
          map.fitBounds(bounds, {
            padding: [72, 72],
            maxZoom: Math.max(map.getZoom() + 2, 8),
          });
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -12]}>
        {label}: {sampleNames}
        {cluster.highlights.length > 4 ? "..." : ""}
      </Tooltip>
    </Marker>
  );
}

function hasNavigationTarget(highlight: Highlight) {
  return highlight.navigationLat !== undefined && highlight.navigationLng !== undefined;
}

function getMapPosition(highlight: Highlight): LatLngExpression {
  return [highlight.lat, highlight.lng];
}

function getNavigationPosition(highlight: Highlight): LatLngExpression {
  return [highlight.navigationLat ?? highlight.lat, highlight.navigationLng ?? highlight.lng];
}

function navigationTargetText(highlight: Highlight) {
  return highlight.navigationLabel ?? highlight.name;
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)} uur`;
}

function tileUrl(x: number, y: number, z: number) {
  const subdomain = ["a", "b", "c"][Math.abs(x + y + z) % 3];
  return `https://${subdomain}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function buildOfflineTileUrls() {
  const bbox = { north: 63.8, south: 57.7, west: 4.3, east: 11.8 };
  const urls: string[] = [];

  for (let z = 5; z <= 8; z += 1) {
    const minX = lonToTileX(bbox.west, z);
    const maxX = lonToTileX(bbox.east, z);
    const minY = latToTileY(bbox.north, z);
    const maxY = latToTileY(bbox.south, z);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        urls.push(tileUrl(x, y, z));
      }
    }
  }

  return urls;
}

function buildOfflinePhotoUrls() {
  return Array.from(
    new Set(
      highlights
        .map((highlight) => highlight.imageUrl)
        .filter((url): url is string => typeof url === "string" && url.startsWith(import.meta.env.BASE_URL)),
    ),
  );
}

const OFFLINE_TILE_URLS = buildOfflineTileUrls();
const OFFLINE_PHOTO_URLS = buildOfflinePhotoUrls();
const OFFLINE_PACKAGE_TOTAL = OFFLINE_TILE_URLS.length + OFFLINE_PHOTO_URLS.length;

function makeCustomStart(lat: number, lng: number, name = "Geprikt startpunt"): Highlight {
  return {
    id: `custom-start-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    name,
    category: "viewpoint",
    region: "Eigen startpunt",
    description: "Handmatig gekozen startlocatie voor de routeberekening.",
    lat,
    lng,
    navigationLat: lat,
    navigationLng: lng,
    navigationLabel: name,
    navigationNote: "Gebruik dit voor campings, hotels, parkeerplekken of spontane overnachtingen.",
    visitTimeHours: 0,
    importance: "optioneel",
    styles: ["rustig", "scenic"],
    note: "Dit punt is lokaal opgeslagen en wordt gebruikt als vertrekpunt voor dagopties.",
  };
}

function App() {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});
  const [settings, setSettings] = useState<PlannerSettings>(() => loadSettings());
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [arePlanningControlsOpen, setArePlanningControlsOpen] = useState(true);
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(settings.savedTodayOptionId);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string>(settings.currentHighlightId);
  const [popupHighlightId, setPopupHighlightId] = useState<string | undefined>();
  const [mapDetailHighlightId, setMapDetailHighlightId] = useState<string | undefined>();
  const [isRouting, setIsRouting] = useState(false);
  const [isPickingStart, setIsPickingStart] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCachingMap, setIsCachingMap] = useState(false);
  const [isOfflineWidgetOpen, setIsOfflineWidgetOpen] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<OfflineDownloadProgress>();
  const [isLayerWidgetOpen, setIsLayerWidgetOpen] = useState(false);
  const [offlineMapMessage, setOfflineMapMessage] = useState<string | undefined>();
  const [mapViewport, setMapViewport] = useState<MapViewport>({ zoom: 6 });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const offlineJobIdRef = useRef<string | undefined>(undefined);
  const offlineWatchdogRef = useRef<number | undefined>(undefined);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const offlineProgressPercent = offlineProgress?.total
    ? Math.round((offlineProgress.completed / offlineProgress.total) * 100)
    : 0;

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleOfflineProgress = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.jobId !== offlineJobIdRef.current) return;
      if (data.type !== "CACHE_OFFLINE_PROGRESS" && data.type !== "CACHE_OFFLINE_COMPLETE") return;

      if (offlineWatchdogRef.current !== undefined) {
        window.clearTimeout(offlineWatchdogRef.current);
        offlineWatchdogRef.current = undefined;
      }

      const progress = {
        completed: Number(data.completed) || 0,
        total: Number(data.total) || OFFLINE_PACKAGE_TOTAL,
        failed: Number(data.failed) || 0,
        phase: typeof data.phase === "string" ? data.phase : "kaart",
      };
      setOfflineProgress(progress);

      if (data.type === "CACHE_OFFLINE_COMPLETE") {
        setIsCachingMap(false);
        offlineJobIdRef.current = undefined;
        setOfflineMapMessage(
          progress.failed
            ? `${progress.completed - progress.failed} van ${progress.total} onderdelen opgeslagen; ${progress.failed} konden niet worden gedownload.`
            : `Offline kaartbasis gereed: ${progress.total} onderdelen opgeslagen.`,
        );
      }
    };

    navigator.serviceWorker.addEventListener("message", handleOfflineProgress);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleOfflineProgress);
      if (offlineWatchdogRef.current !== undefined) {
        window.clearTimeout(offlineWatchdogRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!popupHighlightId) return;

    const timeoutId = window.setTimeout(() => {
      markerRefs.current[popupHighlightId]?.openPopup();
      setPopupHighlightId(undefined);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [popupHighlightId]);

  const priorityHighlightIdSet = useMemo(
    () => new Set(settings.priorityHighlightIds),
    [settings.priorityHighlightIds],
  );
  const completedHighlightIdSet = useMemo(
    () => new Set(settings.completedHighlightIds),
    [settings.completedHighlightIds],
  );
  const enabledCategorySet = useMemo(
    () => new Set(settings.enabledCategories),
    [settings.enabledCategories],
  );
  const enabledPersonalLayerSet = useMemo(
    () => new Set(settings.enabledPersonalLayers),
    [settings.enabledPersonalLayers],
  );

  const selectedDatasetHighlight = highlightById.get(settings.currentHighlightId) ?? highlights[0];
  const currentHighlight = useMemo(
    () =>
      settings.customStart
        ? makeCustomStart(settings.customStart.lat, settings.customStart.lng, settings.customStart.name)
        : selectedDatasetHighlight,
    [selectedDatasetHighlight, settings.customStart],
  );
  const selectedDayStyleLabel = dayStyles.find((style) => style.value === settings.dayStyle)?.label ?? "Vrij";
  const selectedTripDirectionLabel =
    tripDirections.find((direction) => direction.value === settings.tripDirection)?.label ?? "Vrij";

  const selectedOption = routeOptions.find((option) => option.id === selectedOptionId);
  const focusedHighlight =
    settings.customStart && selectedHighlightId.startsWith("custom-start-")
      ? currentHighlight
      : highlightById.get(selectedHighlightId);
  const mapDetailHighlight = mapDetailHighlightId ? highlightById.get(mapDetailHighlightId) : undefined;
  const mapDetailRegionHighlights = useMemo(
    () =>
      mapDetailHighlight
        ? highlights
            .filter((highlight) => highlight.region === mapDetailHighlight.region && highlight.id !== mapDetailHighlight.id)
            .slice(0, 5)
        : [],
    [mapDetailHighlight],
  );
  const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
  const matchesSearch = (highlight: Highlight) => {
    if (!normalizedSearch) return true;
    return highlightSearchIndex.get(highlight.id)?.includes(normalizedSearch) ?? false;
  };

  const matchesSleepBase = (sleepBase: SleepBase) => {
    if (!normalizedSearch) return true;
    return sleepBaseSearchIndex.get(sleepBase.id)?.includes(normalizedSearch) ?? false;
  };

  const filteredHighlights = useMemo(() => {
    const visible = new Map<string, Highlight>();
    const showCompleted = enabledPersonalLayerSet.has("completed");

    highlights.forEach((highlight) => {
      const isCompleted = completedHighlightIdSet.has(highlight.id);
      const baseVisible =
        enabledCategorySet.has(highlight.category) &&
        matchesSearch(highlight) &&
        (settings.dayStyle !== "slechtweer" ||
          highlight.styles.includes("slechtweer") ||
          badWeatherVisibleCategories.has(highlight.category));

      if (baseVisible && (!isCompleted || showCompleted)) {
        visible.set(highlight.id, highlight);
      }
    });

    if (enabledPersonalLayerSet.has("favorites")) {
      highlights.forEach((highlight) => {
        if (!priorityHighlightIdSet.has(highlight.id)) return;
        if (!matchesSearch(highlight)) return;
        if (completedHighlightIdSet.has(highlight.id) && !showCompleted) return;
        visible.set(highlight.id, highlight);
      });
    }

    return Array.from(visible.values());
  }, [
    completedHighlightIdSet,
    enabledCategorySet,
    enabledPersonalLayerSet,
    normalizedSearch,
    priorityHighlightIdSet,
    settings.dayStyle,
  ]);
  const searchResults = useMemo(
    () =>
      normalizedSearch
        ? highlights
            .filter(matchesSearch)
            .sort((a, b) => {
              const aCompleted = completedHighlightIdSet.has(a.id) ? 1 : 0;
              const bCompleted = completedHighlightIdSet.has(b.id) ? 1 : 0;
              const aPriority = priorityHighlightIdSet.has(a.id) ? 1 : 0;
              const bPriority = priorityHighlightIdSet.has(b.id) ? 1 : 0;
              return aCompleted - bCompleted || bPriority - aPriority || a.name.localeCompare(b.name);
            })
            .slice(0, 6)
        : [],
    [completedHighlightIdSet, normalizedSearch, priorityHighlightIdSet],
  );

  const visibleSleepBases = useMemo(
    () =>
      enabledPersonalLayerSet.has("sleepBases")
        ? sleepBases.filter(matchesSleepBase)
        : [],
    [enabledPersonalLayerSet, normalizedSearch],
  );

  const routeLine = selectedOption?.routePath?.length
    ? selectedOption.routePath
    : selectedOption
      ? [
          [currentHighlight.lat, currentHighlight.lng] as LatLngExpression,
          ...selectedOption.stops.map((stop) => [stop.highlight.lat, stop.highlight.lng] as LatLngExpression),
        ]
      : [];
  const navigationTargets = selectedOption
    ? [currentHighlight, ...selectedOption.stops.map((stop) => stop.highlight)].filter(hasNavigationTarget)
    : [];
  const pinnedHighlightIds = useMemo(() => {
    const pinned = new Set<string>([currentHighlight.id, selectedHighlightId]);
    if (mapDetailHighlightId) pinned.add(mapDetailHighlightId);
    selectedOption?.stops.forEach((stop) => pinned.add(stop.highlight.id));
    return pinned;
  }, [currentHighlight.id, mapDetailHighlightId, selectedHighlightId, selectedOption]);
  const renderedHighlights = useMemo(() => {
    const bounds = mapViewport.bounds;
    if (!bounds) return filteredHighlights;
    return filteredHighlights.filter(
      (highlight) =>
        pinnedHighlightIds.has(highlight.id) || isInsidePaddedViewport(highlight, bounds),
    );
  }, [filteredHighlights, mapViewport.bounds, pinnedHighlightIds]);
  const renderedSleepBases = useMemo(() => {
    const bounds = mapViewport.bounds;
    if (!bounds) return visibleSleepBases;
    return visibleSleepBases.filter((sleepBase) => isInsidePaddedViewport(sleepBase, bounds));
  }, [mapViewport.bounds, visibleSleepBases]);
  const { clusters: highlightClusters, individualHighlights } = useMemo(
    () =>
      buildHighlightClusters({
        highlights: renderedHighlights,
        pinnedIds: pinnedHighlightIds,
        priorityIds: priorityHighlightIdSet,
        zoom: mapViewport.zoom,
        disableClustering: Boolean(normalizedSearch),
      }),
    [mapViewport.zoom, normalizedSearch, pinnedHighlightIds, priorityHighlightIdSet, renderedHighlights],
  );

  function clearCurrentRouteOptions() {
    setRouteOptions([]);
    setSelectedOptionId(undefined);
    setArePlanningControlsOpen(true);
  }

  function updateSettings(update: Partial<PlannerSettings>) {
    setSettings((current) => ({ ...current, ...update }));
  }

  function updatePlanningSettings(update: Partial<PlannerSettings>) {
    updateSettings({ ...update, savedTodayOptionId: undefined });
    clearCurrentRouteOptions();
  }

  function updateEv(key: keyof PlannerSettings["ev"], value: number) {
    setSettings((current) => ({
      ...current,
      ev: { ...current.ev, [key]: value },
      savedTodayOptionId: undefined,
    }));
    clearCurrentRouteOptions();
  }

  function toggleLayerGroup(categories: Category[]) {
    const allEnabled = categories.every((category) => enabledCategorySet.has(category));
    const enabled = allEnabled
      ? settings.enabledCategories.filter((category) => !categories.includes(category))
      : Array.from(new Set([...settings.enabledCategories, ...categories]));
    updateSettings({ enabledCategories: enabled });
  }

  function togglePersonalLayer(layer: PersonalMapLayer) {
    const enabled = enabledPersonalLayerSet.has(layer)
      ? settings.enabledPersonalLayers.filter((item) => item !== layer)
      : [...settings.enabledPersonalLayers, layer];
    updateSettings({ enabledPersonalLayers: enabled });
  }

  function setMapFocusMode(mapFocusMode: boolean) {
    updateSettings({ mapFocusMode });
  }

  function togglePriorityHighlight(highlightId: string) {
    setSettings((current) => {
      const isPriority = current.priorityHighlightIds.includes(highlightId);
      return {
        ...current,
        priorityHighlightIds: isPriority
          ? current.priorityHighlightIds.filter((id) => id !== highlightId)
          : [highlightId, ...current.priorityHighlightIds],
        completedHighlightIds: current.completedHighlightIds.filter((id) => id !== highlightId),
        savedTodayOptionId: undefined,
      };
    });
    clearCurrentRouteOptions();
  }

  function toggleCompletedHighlight(highlightId: string) {
    setSettings((current) => {
      const isCompleted = current.completedHighlightIds.includes(highlightId);
      return {
        ...current,
        completedHighlightIds: isCompleted
          ? current.completedHighlightIds.filter((id) => id !== highlightId)
          : [highlightId, ...current.completedHighlightIds],
        priorityHighlightIds: isCompleted
          ? current.priorityHighlightIds
          : current.priorityHighlightIds.filter((id) => id !== highlightId),
        savedTodayOptionId: undefined,
      };
    });
    clearCurrentRouteOptions();
  }

  async function prepareOfflineMap() {
    setOfflineMapMessage(undefined);
    setIsOfflineWidgetOpen(true);

    if (!("serviceWorker" in navigator)) {
      setOfflineMapMessage("Offline kaartcache werkt niet in deze browser.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active ?? navigator.serviceWorker.controller;
    if (!worker) {
      setOfflineMapMessage("Service worker is nog niet actief. Ververs de app en probeer opnieuw.");
      return;
    }

    const jobId = `offline-${Date.now()}`;
    offlineJobIdRef.current = jobId;
    setIsCachingMap(true);
    setOfflineProgress({ completed: 0, total: OFFLINE_PACKAGE_TOTAL, failed: 0, phase: "kaart" });
    worker.postMessage({
      type: "CACHE_OFFLINE_PACKAGE",
      jobId,
      tiles: OFFLINE_TILE_URLS,
      photos: OFFLINE_PHOTO_URLS,
    });

    offlineWatchdogRef.current = window.setTimeout(() => {
      if (offlineJobIdRef.current !== jobId) return;
      offlineJobIdRef.current = undefined;
      setIsCachingMap(false);
      setOfflineMapMessage("De offlinefunctie is bijgewerkt. Ververs de app en probeer de download opnieuw.");
    }, 8000);
  }

  function setCustomStart(lat: number, lng: number, name = "Geprikt startpunt") {
    setSettings((current) => ({
      ...current,
      customStart: {
        lat,
        lng,
        name,
      },
      savedTodayOptionId: undefined,
    }));
    setSelectedHighlightId(`custom-start-${lat.toFixed(5)}-${lng.toFixed(5)}`);
    setMapDetailHighlightId(undefined);
    clearCurrentRouteOptions();
    setIsPickingStart(false);
  }

  function useGpsAsStart() {
    setLocationMessage(undefined);

    if (!("geolocation" in navigator)) {
      setLocationMessage("GPS is niet beschikbaar in deze browser.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(5));
        const lng = Number(position.coords.longitude.toFixed(5));
        const accuracy = Math.round(position.coords.accuracy);
        setCustomStart(lat, lng, "Mijn GPS-locatie");
        setLocationMessage(`GPS-startpunt gezet. Nauwkeurigheid ongeveer ${accuracy} meter.`);
        setIsLocating(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Locatietoegang geweigerd. Zet locatie aan voor Safari/deze site en probeer opnieuw."
            : error.code === error.TIMEOUT
              ? "GPS duurde te lang. Probeer buiten of met beter bereik opnieuw."
              : "GPS-locatie kon niet worden bepaald.";
        setLocationMessage(message);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  }

  function clearCustomStart() {
    setSettings((current) => ({
      ...current,
      customStart: undefined,
      savedTodayOptionId: undefined,
    }));
    setSelectedHighlightId(settings.currentHighlightId);
    setMapDetailHighlightId(settings.currentHighlightId);
    clearCurrentRouteOptions();
    setIsPickingStart(false);
  }

  async function showOptions() {
    setIsPickingStart(false);
    setMapFocusMode(false);
    setIsRouting(true);
    try {
      const { generateRouteOptions } = await import("./lib/routeLogic");
      const nextOptions = await generateRouteOptions(
        currentHighlight,
        settings.dayStyle,
        settings.maxDriveHours,
        settings.ev,
        settings.tripDirection,
        settings.priorityHighlightIds,
        settings.completedHighlightIds,
      );
      setRouteOptions(nextOptions);
      setSelectedOptionId(nextOptions[0]?.id);
      updateSettings({ savedTodayOptionId: nextOptions[0]?.id });
      setArePlanningControlsOpen(false);
    } finally {
      setIsRouting(false);
    }
  }

  function resetFilters() {
    setSettings((current) => ({
      ...defaultSettings,
      ev: current.ev,
      priorityHighlightIds: current.priorityHighlightIds,
      completedHighlightIds: current.completedHighlightIds,
      recentlyViewedHighlightIds: current.recentlyViewedHighlightIds,
      enabledPersonalLayers: current.enabledPersonalLayers,
      mapFocusMode: current.mapFocusMode,
    }));
    setMapDetailHighlightId(undefined);
    clearCurrentRouteOptions();
  }

  function rememberHighlight(highlight: Highlight) {
    setSelectedHighlightId(highlight.id);
    setSettings((current) => ({
      ...current,
      recentlyViewedHighlightIds: [
        highlight.id,
        ...current.recentlyViewedHighlightIds.filter((id) => id !== highlight.id),
      ].slice(0, 6),
    }));
  }

  function closeOpenHighlightPopups() {
    Object.values(markerRefs.current).forEach((marker) => marker?.closePopup());
    setPopupHighlightId(undefined);
  }

  function openHighlightDetail(highlight: Highlight) {
    rememberHighlight(highlight);
    closeOpenHighlightPopups();
    setMapDetailHighlightId(highlight.id);
  }

  function openHighlightPopup(highlight: Highlight) {
    rememberHighlight(highlight);
    setMapDetailHighlightId(undefined);
    setPopupHighlightId(highlight.id);
  }

  function useAsCurrent(highlight: Highlight) {
    updateSettings({ currentHighlightId: highlight.id, customStart: undefined });
    setSelectedHighlightId(highlight.id);
    clearCurrentRouteOptions();
    setIsPickingStart(false);
  }

  return (
    <main className={`app-shell ${settings.mapFocusMode ? "panel-collapsed map-focus-mode" : ""}`}>
      <section
        className={`map-stage ${isPickingStart ? "picking-start" : ""}`}
        aria-label="Interactieve kaart van Noorwegen"
      >
        <div className="map-control-cluster" onMouseDown={(event) => event.stopPropagation()}>
          <div className="map-search-widget">
            <Search size={17} />
            <input
              id="map-search"
              type="search"
              placeholder="Zoek plek, regio, hike..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button type="button" className="map-clear-button" onClick={() => setSearchQuery("")} aria-label="Wis zoekterm">
                x
              </button>
            )}
          </div>
          <div className="map-action-row">
            <button
              className={isOfflineWidgetOpen ? "map-action-button active" : "map-action-button"}
              type="button"
              onClick={() => setIsOfflineWidgetOpen((current) => !current)}
              title="Bekijk en download de offline kaartbasis"
              aria-expanded={isOfflineWidgetOpen}
            >
              <Download size={16} />
              <span>{isCachingMap ? `${offlineProgressPercent}%` : "Offline"}</span>
            </button>
            <button
              className="map-action-button"
              type="button"
              onClick={useGpsAsStart}
              disabled={isLocating}
              title="Gebruik de GPS-locatie van dit apparaat als startpunt"
              aria-label="Gebruik GPS als startpunt"
            >
              <LocateFixed size={16} />
              <span>{isLocating ? "GPS..." : "GPS"}</span>
            </button>
            <button
              className={isPickingStart ? "map-action-button active" : "map-action-button"}
              type="button"
              onClick={() => setIsPickingStart((current) => !current)}
              title="Prik een slaapplaats, camping of parkeerplek op de kaart"
              aria-label="Prik startpunt op de kaart"
            >
              <MapPinned size={16} />
              <span>{isPickingStart ? "Tik kaart" : "Prik start"}</span>
            </button>
            <button
              className={isLayerWidgetOpen ? "map-action-button active" : "map-action-button"}
              type="button"
              onClick={() => setIsLayerWidgetOpen((current) => !current)}
              title="Kaartlagen aan- of uitzetten"
              aria-expanded={isLayerWidgetOpen}
            >
              <Layers size={16} />
              <span>Lagen</span>
            </button>
          </div>
          {isOfflineWidgetOpen && (
            <div className="map-offline-popover">
              <header>
                <div className="map-offline-heading">
                  <Download size={17} />
                  <div>
                    <strong>Offline kaartbasis</strong>
                    <span>Zuid- en Midden-Noorwegen</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="map-offline-close"
                  onClick={() => setIsOfflineWidgetOpen(false)}
                  aria-label="Sluit offline kaartvenster"
                >
                  <X size={16} />
                </button>
              </header>
              <p className="map-offline-area">
                <strong>Gebied:</strong> Kristiansand tot Atlantic Road, inclusief Stavanger, Bergen,
                Geiranger en Oslo.
              </p>
              <div className="map-offline-meta" aria-label="Inhoud offline pakket">
                <span>Zoom 5-8</span>
                <span>{OFFLINE_TILE_URLS.length} tegels</span>
                <span>{OFFLINE_PHOTO_URLS.length} foto's</span>
              </div>
              <p className="map-offline-note">
                Dit geeft overzicht en regioniveau. Straatdetail wordt bewaard zodra je het online bekijkt.
              </p>
              {offlineProgress && (
                <div className="map-offline-progress" aria-live="polite">
                  <div>
                    <span>{isCachingMap ? `Bezig met ${offlineProgress.phase}` : "Downloadstatus"}</span>
                    <strong>{offlineProgressPercent}%</strong>
                  </div>
                  <progress max={offlineProgress.total} value={offlineProgress.completed} />
                  <small>
                    {offlineProgress.completed} van {offlineProgress.total}
                    {offlineProgress.failed ? ` - ${offlineProgress.failed} mislukt` : ""}
                  </small>
                </div>
              )}
              {offlineMapMessage && <p className="map-offline-message">{offlineMapMessage}</p>}
              <button
                type="button"
                className="map-offline-download"
                onClick={prepareOfflineMap}
                disabled={isCachingMap || !isOnline}
              >
                {isCachingMap ? (
                  <>
                    <span className="map-offline-spinner" aria-hidden="true" />
                    Downloaden
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    {offlineProgress && offlineProgress.completed === offlineProgress.total
                      ? "Pakket bijwerken"
                      : "Download kaartbasis"}
                  </>
                )}
              </button>
              {!isOnline && <small className="map-offline-warning">Maak verbinding om dit pakket te downloaden.</small>}
            </div>
          )}
          {!!searchResults.length && (
            <div className="map-search-results">
              {searchResults.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    openHighlightPopup(highlight);
                  }}
                >
                  <span>{highlight.name}</span>
                  <em>{highlight.region}</em>
                </button>
              ))}
            </div>
          )}
          {settings.customStart && (
            <div className="map-status-row">
              <span>Startpunt geprikt</span>
              <button type="button" onClick={clearCustomStart}>Wis</button>
            </div>
          )}
          {locationMessage && (
            <div className="map-cluster-message">
              <p>{locationMessage}</p>
            </div>
          )}
          {isLayerWidgetOpen && (
            <div className="map-layer-popover">
              <span className="layer-group-label">Kaartlagen</span>
              {mapLayerGroups.map((layer) => {
                const isChecked = layer.categories.every((category) => enabledCategorySet.has(category));
                const LayerIcon = layer.icon;
                return (
                  <label key={layer.id} className="map-layer-toggle">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleLayerGroup(layer.categories)}
                    />
                    <span className="layer-symbol" style={{ backgroundColor: layer.color }}>
                      <LayerIcon size={13} strokeWidth={2.6} />
                    </span>
                    {layer.label}
                  </label>
                );
              })}
              <span className="layer-group-label">Persoonlijk</span>
              {personalMapLayers.map((layer) => {
                const LayerIcon = layer.icon;
                return (
                  <label key={layer.id} className="map-layer-toggle">
                    <input
                      type="checkbox"
                      checked={enabledPersonalLayerSet.has(layer.id)}
                      onChange={() => togglePersonalLayer(layer.id)}
                    />
                    <span className="layer-symbol" style={{ backgroundColor: layer.color }}>
                      <LayerIcon size={13} strokeWidth={2.6} />
                    </span>
                    {layer.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {mapDetailHighlight && (
          <aside
            className="map-detail-card"
            aria-label={`Kaartinformatie over ${mapDetailHighlight.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="map-detail-close"
              onClick={() => setMapDetailHighlightId(undefined)}
              aria-label="Sluit kaartinformatie"
            >
              <X size={16} />
            </button>
            <div className="map-detail-heading">
              <span>{categoryLabels[mapDetailHighlight.category]} - {mapDetailHighlight.region}</span>
              <strong>{mapDetailHighlight.name}</strong>
            </div>
            <HighlightImage highlight={mapDetailHighlight} className="map-detail-image" showCredit />
            <p className="map-detail-intro">{mapDetailHighlight.description}</p>
            <div className="map-detail-actions">
              <button type="button" onClick={() => useAsCurrent(mapDetailHighlight)}>
                <MapPinned size={14} />
                Start
              </button>
              <button
                type="button"
                className={priorityHighlightIdSet.has(mapDetailHighlight.id) ? "active priority" : "priority"}
                onClick={() => togglePriorityHighlight(mapDetailHighlight.id)}
              >
                <Star size={14} />
                {priorityHighlightIdSet.has(mapDetailHighlight.id) ? "Zeker" : "Bewaar"}
              </button>
              <button
                type="button"
                className={completedHighlightIdSet.has(mapDetailHighlight.id) ? "active done" : "done"}
                onClick={() => toggleCompletedHighlight(mapDetailHighlight.id)}
              >
                <CheckCircle2 size={14} />
                Gedaan
              </button>
            </div>
            <dl className="map-detail-facts">
              <div>
                <dt>Bezoek</dt>
                <dd>{formatHours(mapDetailHighlight.visitTimeHours)}</dd>
              </div>
              <div>
                <dt>Waarde</dt>
                <dd>{mapDetailHighlight.importance}</dd>
              </div>
              {mapDetailHighlight.navigationLabel && (
                <div>
                  <dt>Navigatie</dt>
                  <dd>{navigationTargetText(mapDetailHighlight)}</dd>
                </div>
              )}
            </dl>
            <div className="map-detail-copy">
              {(mapDetailHighlight.detail ?? []).slice(0, 2).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {mapDetailHighlight.contentTips && (
              <div className="map-detail-tips">
                <div>
                  <strong>Past bij</strong>
                  <div className="content-fit-tags">
                    {mapDetailHighlight.contentTips.fits.slice(0, 4).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
                <p><strong>Beste moment:</strong> {mapDetailHighlight.contentTips.bestMoment}</p>
                <p><strong>Overslaan als:</strong> {mapDetailHighlight.contentTips.skipWhen}</p>
                <p><strong>Praktisch:</strong> {mapDetailHighlight.contentTips.logistics}</p>
              </div>
            )}
            {!!mapDetailRegionHighlights.length && (
              <div className="map-region-strip">
                <strong>{mapDetailHighlight.region} op de kaart</strong>
                <p>{mapDetailRegionHighlights.length} andere logische punten in deze regio.</p>
                <div>
                  {mapDetailRegionHighlights.slice(0, 4).map((highlight) => (
                    <button
                      key={highlight.id}
                      type="button"
                      onClick={() => openHighlightDetail(highlight)}
                    >
                      {highlight.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
        <MapContainer
          center={[currentHighlight.lat, currentHighlight.lng]}
          zoom={8}
          minZoom={5}
          maxZoom={15}
          zoomControl={false}
          fadeAnimation={false}
          className="map"
        >
          <TrackMapViewport onChange={setMapViewport} />
          <MapClickPicker enabled={isPickingStart} onPick={setCustomStart} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            updateWhenIdle={false}
            updateWhenZooming={true}
            keepBuffer={3}
          />

          {highlightClusters.map((cluster) => (
            <HighlightClusterMarker key={cluster.id} cluster={cluster} />
          ))}

          {individualHighlights.map((highlight) => {
            const isCurrent = highlight.id === currentHighlight.id;
            const isSelected = highlight.id === selectedHighlightId;
            const isPriority = priorityHighlightIdSet.has(highlight.id);
            const isCompleted = completedHighlightIdSet.has(highlight.id);
            return (
              <Marker
                key={highlight.id}
                ref={(marker) => {
                  markerRefs.current[highlight.id] = marker;
                }}
                position={[highlight.lat, highlight.lng]}
                icon={highlightMapIcon({
                  highlight,
                  isCurrent,
                  isSelected,
                  isPriority: enabledPersonalLayerSet.has("favorites") && isPriority,
                  isCompleted,
                })}
                eventHandlers={{ click: () => {
                  rememberHighlight(highlight);
                  setMapDetailHighlightId(undefined);
                } }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {highlight.name}{isCompleted ? " - gedaan" : ""}
                </Tooltip>
                <Popup>
                  <div className="popup">
                    <div className="popup-title-row">
                      <div>
                        <strong>{highlight.name}</strong>
                        <span>{categoryLabels[highlight.category]} - {highlight.region}</span>
                      </div>
                      {isCompleted && <span className="done-label">Gedaan</span>}
                    </div>
                    <button
                      type="button"
                      className="popup-more-info-button"
                      onClick={() => openHighlightDetail(highlight)}
                      title="Open uitgebreide informatie"
                    >
                      <Binoculars size={13} />
                      Meer info
                    </button>
                    <div className="popup-actions compact">
                      <button
                        type="button"
                        className="popup-action-button"
                        onClick={() => useAsCurrent(highlight)}
                        title="Gebruik als startpunt voor dagopties"
                      >
                        <MapPinned size={14} />
                        <span>Start</span>
                      </button>
                      <button
                        type="button"
                        className={isPriority ? "popup-action-button priority active" : "popup-action-button priority"}
                        onClick={() => togglePriorityHighlight(highlight.id)}
                        title={isPriority ? "Verwijder uit zeker doen" : "Markeer als zeker doen"}
                      >
                        <Star size={14} />
                        <span>{isPriority ? "Zeker" : "Bewaar"}</span>
                      </button>
                      <button
                        type="button"
                        className={isCompleted ? "popup-action-button done active" : "popup-action-button done"}
                        onClick={() => toggleCompletedHighlight(highlight.id)}
                        title={isCompleted ? "Zet terug in de planner" : "Markeer als gedaan"}
                      >
                        <CheckCircle2 size={14} />
                        <span>Gedaan</span>
                      </button>
                    </div>
                    {isPriority && !isCompleted && <span className="priority-label">Zeker doen</span>}
                    <HighlightImage highlight={highlight} className="popup-image" showCredit />
                    <p>{highlight.description}</p>
                    <dl>
                      <div>
                        <dt>Bezoektijd</dt>
                        <dd>{formatHours(highlight.visitTimeHours)}</dd>
                      </div>
                      <div>
                        <dt>Indicatie</dt>
                        <dd>{highlight.importance}</dd>
                      </div>
                    </dl>
                    {highlight.contentTips && (
                      <p className="note">
                        <strong>Beste moment:</strong> {highlight.contentTips.bestMoment}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {renderedSleepBases.map((sleepBase) => (
            <Marker
              key={sleepBase.id}
              position={[sleepBase.lat, sleepBase.lng]}
              icon={mapSymbolIcon({ Icon: "home", color: "#be123c", className: "sleepbase-marker" })}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                Slaapbasis: {sleepBase.name}
              </Tooltip>
              <Popup>
                <div className="popup sleepbase-popup">
                  <div className="popup-title-row">
                    <div>
                      <strong>{sleepBase.name}</strong>
                      <span>Slaapbasis - {sleepBase.region}</span>
                    </div>
                  </div>
                  <div className="popup-actions compact sleepbase-actions">
                    <button
                      type="button"
                      className="popup-action-button sleepbase-start"
                      onClick={() => setCustomStart(sleepBase.lat, sleepBase.lng, sleepBase.name)}
                      title="Gebruik deze slaapbasis als startpunt"
                    >
                      <MapPinned size={14} />
                      <span>Start hier</span>
                    </button>
                  </div>
                  <p>{sleepBase.description}</p>
                  <div className="sleepbase-tags">
                    {sleepBase.bestFor.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <p className="sleepbase-moment">
                    <strong>Moment:</strong> {sleepBase.tripMoment}
                  </p>
                  <p className="note">{sleepBase.note}</p>
                  <div className="sleepbase-daytrips" aria-label="Logische dagtrips">
                    {sleepBase.dayTrips.slice(0, 4).map((dayTrip) => (
                      <span key={dayTrip}>{dayTrip}</span>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {settings.customStart && (
            <Marker
              position={[settings.customStart.lat, settings.customStart.lng]}
              icon={mapSymbolIcon({ Icon: "mapPin", color: "#facc15", active: true, className: "custom-start-marker" })}
            >
              <Tooltip permanent direction="top" offset={[0, -10]} className="custom-start-tooltip">
                Geprikt startpunt
              </Tooltip>
              <Popup>
                <div className="popup navigation-popup">
                  <strong>Geprikt startpunt</strong>
                  <span>
                    {settings.customStart.lat.toFixed(5)}, {settings.customStart.lng.toFixed(5)}
                  </span>
                  <p>Routevoorstellen vertrekken vanaf dit handmatig gekozen punt.</p>
                  <button type="button" className="text-button" onClick={clearCustomStart}>
                    Terug naar highlight als startpunt
                  </button>
                </div>
              </Popup>
            </Marker>
          )}

          {routeLine.length > 1 && (
            <Polyline positions={routeLine} pathOptions={{ color: "#111827", weight: 4, opacity: 0.72 }} />
          )}

          {navigationTargets.map((highlight, index) => (
            <Fragment key={`navigation-target-${highlight.id}`}>
              <Polyline
                positions={[getNavigationPosition(highlight), getMapPosition(highlight)]}
                pathOptions={{ color: "#0f766e", weight: 2, opacity: 0.8, dashArray: "4 6" }}
              />
              <Marker
                position={getNavigationPosition(highlight)}
                icon={mapSymbolIcon({ Icon: "navigation", color: "#0f766e", className: "navigation-target-marker" })}
              >
                <Tooltip
                  permanent
                  direction="right"
                  offset={[10, 0]}
                  className="navigation-target-tooltip"
                >
                  {index === 0 ? "Start route" : "Nav stop"}
                </Tooltip>
                <Popup>
                  <div className="popup navigation-popup">
                    <strong>{index === 0 ? "Startpunt routeberekening" : "Navigatiepunt"}</strong>
                    <span>{navigationTargetText(highlight)}</span>
                    <details className="popup-details">
                      <summary>Uitleg navigatiepunt</summary>
                      <p>
                        De routelijn gebruikt dit praktische aankomstpunt voor {highlight.name}, meestal een parking,
                        trailhead, kade of centrumparking.
                      </p>
                      {highlight.navigationNote && <p className="note">{highlight.navigationNote}</p>}
                    </details>
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          ))}

          <FitRoute selectedOption={selectedOption} />
          <FocusHighlight highlight={focusedHighlight} />
        </MapContainer>
      </section>

      <aside className="side-panel" aria-label="Planner instellingen en routeopties">
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setMapFocusMode(!settings.mapFocusMode)}
          aria-expanded={!settings.mapFocusMode}
        >
          {settings.mapFocusMode ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span>{settings.mapFocusMode ? "Volledige planner" : "Kaartmodus"}</span>
          <em>
            {currentHighlight.name}
            {routeOptions.length ? ` - ${routeOptions.length} opties` : ""}
          </em>
        </button>
        <div className="panel-content">
          <header className="panel-header compact">
            <div className="panel-title">
              <span className="eyebrow">EV roadtrip - 16 dagen</span>
              <h1>Dagopties vanaf {currentHighlight.name}</h1>
              <span className={isOnline ? "connection-pill online" : "connection-pill offline"}>
                {isOnline ? "Online routes" : "Offline schattingen"}
              </span>
            </div>
            <button className="icon-button" type="button" onClick={resetFilters} aria-label="Reset filters">
              <RotateCcw size={18} />
            </button>
          </header>

          {!!routeOptions.length && !arePlanningControlsOpen && (
            <button
              type="button"
              className="planner-summary"
              onClick={() => setArePlanningControlsOpen(true)}
            >
              <span className="planner-summary-main">
                <Settings2 size={16} />
                <strong>Instellingen aanpassen</strong>
              </span>
              <span className="planner-summary-values">
                {selectedDayStyleLabel} · {selectedTripDirectionLabel} · max. {formatHours(settings.maxDriveHours)}
              </span>
            </button>
          )}

          {(arePlanningControlsOpen || !routeOptions.length) && (
            <div className="planner-controls">
              <section className="control-section planning-basics">
                <div className="start-summary">
                  <MapPinned size={17} />
                  <div>
                    <span>Startpunt</span>
                    <strong>{currentHighlight.name}</strong>
                  </div>
                  {settings.customStart && (
                    <button type="button" onClick={clearCustomStart}>Wis</button>
                  )}
                </div>

                <div className="range-row">
                  <label htmlFor="drive-hours">Gewenste rijtijd</label>
                  <strong>{formatHours(settings.maxDriveHours)}</strong>
                </div>
                <input
                  id="drive-hours"
                  type="range"
                  min="1"
                  max="4"
                  step="0.5"
                  value={settings.maxDriveHours}
                  onChange={(event) => updatePlanningSettings({ maxDriveHours: Number(event.target.value) })}
                />
              </section>

              <section className="control-section">
                <div className="section-title">
                  <Sparkles size={17} />
                  <h2>Dagstijl</h2>
                </div>
                <div className="segmented day-style-segmented">
                  {dayStyles.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      className={settings.dayStyle === style.value ? "active" : ""}
                      onClick={() => updatePlanningSettings({ dayStyle: style.value })}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="control-section">
                <div className="section-title">
                  <Compass size={17} />
                  <h2>Reisfase</h2>
                </div>
                <div className="segmented direction-segmented">
                  {tripDirections.map((direction) => (
                    <button
                      key={direction.value}
                      type="button"
                      className={settings.tripDirection === direction.value ? "active" : ""}
                      onClick={() => updatePlanningSettings({ tripDirection: direction.value })}
                    >
                      {direction.label}
                    </button>
                  ))}
                </div>
                <details className="phase-help">
                  <summary>Wat betekent dit?</summary>
                  <p className="microcopy">
                    Gebruik Heen tot Geiranger of Atlantic Road. Zet Terug aan zodra Oslo, Telemark of
                    Kristiansand weer leidend wordt.
                  </p>
                </details>
              </section>

              <details className="ev-settings-panel">
                <summary>
                  <span><Zap size={17} /> Peugeot E-3008 EV-marges</span>
                  <em>Aanpassen</em>
                </summary>
                <div className="ev-settings-content">
                  <div className="ev-grid">
                    <label>
                      Praktische range
                      <input
                        type="number"
                        min="250"
                        max="550"
                        value={settings.ev.practicalRangeKm}
                        onChange={(event) => updateEv("practicalRangeKm", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Veiligheidsmarge %
                      <input
                        type="number"
                        min="5"
                        max="35"
                        value={settings.ev.safetyMarginPercent}
                        onChange={(event) => updateEv("safetyMarginPercent", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Min. batterij aankomst %
                      <input
                        type="number"
                        min="5"
                        max="35"
                        value={settings.ev.minArrivalBatteryPercent}
                        onChange={(event) => updateEv("minArrivalBatteryPercent", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Max zonder laden km
                      <input
                        type="number"
                        min="120"
                        max="420"
                        value={settings.ev.maxDistanceWithoutChargingKm}
                        onChange={(event) => updateEv("maxDistanceWithoutChargingKm", Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <p className="disclaimer">
                    Indicatieve EV-inschatting zonder actuele laadpaaldata. Controleer echte laadstops onderweg.
                  </p>
                </div>
              </details>

              <div className="action-row">
                <button className="primary-button" type="button" onClick={showOptions} disabled={isRouting}>
                  <Route size={18} />
                  {isRouting ? "Routes berekenen..." : "Bekijk dagopties"}
                </button>
              </div>
            </div>
          )}

          {!!routeOptions.length && !arePlanningControlsOpen && (
            <section className="options-section">
              <div className="section-title">
                <Compass size={17} />
                <h2>{routeOptions.length} verschillende keuzes</h2>
              </div>
              <Suspense fallback={<div className="empty-state">Routekaarten laden...</div>}>
                {routeOptions.map((option) => (
                  <RouteOptionCard
                    key={option.id}
                    option={option}
                    isSelected={selectedOptionId === option.id}
                    priorityHighlightIdSet={priorityHighlightIdSet}
                    completedHighlightIdSet={completedHighlightIdSet}
                    onSelect={(optionId) => {
                      setSelectedOptionId(optionId);
                      updateSettings({ savedTodayOptionId: optionId });
                      setMapFocusMode(true);
                    }}
                    onOpenHighlight={openHighlightPopup}
                  />
                ))}
              </Suspense>
            </section>
          )}
        </div>
      </aside>
    </main>
  );
}

export default App;
