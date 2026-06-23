import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, Polyline, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import type { CircleMarker as LeafletCircleMarker, LatLngExpression } from "leaflet";
import {
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Download,
  Flag,
  Gauge,
  LocateFixed,
  Layers,
  MapPinned,
  Mountain,
  RotateCcw,
  Route,
  Search,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { categoryColors, categoryLabels, highlights } from "./data/highlights";
import { sleepBases } from "./data/sleepBases";
import { generateRouteOptions } from "./lib/routeLogic";
import { defaultSettings, loadSettings, saveSettings } from "./lib/storage";
import type { Category, Highlight, PersonalMapLayer, PlannerSettings, RouteOption, SleepBase, TravelStyle, TripDirection } from "./types";

const dayStyles: Array<{ value: TravelStyle; label: string }> = [
  { value: "rustig", label: "Rustig" },
  { value: "actief", label: "Actief" },
  { value: "scenic", label: "Natuur/scenic" },
  { value: "slechtweer", label: "Stad/regen" },
];

const tripDirections: Array<{ value: TripDirection; label: string }> = [
  { value: "outbound", label: "Heen/noord" },
  { value: "flexible", label: "Vrij" },
  { value: "returning", label: "Terug" },
];

const mapLayerGroups: Array<{
  id: string;
  label: string;
  categories: Category[];
}> = [
  { id: "city-culture", label: "Steden & cultuur", categories: ["city", "stave_church"] },
  { id: "fjords-water", label: "Fjorden & water", categories: ["fjord", "kayak"] },
  { id: "hikes-nature", label: "Hikes & natuur", categories: ["hike"] },
  { id: "views-routes", label: "Uitzicht & routes", categories: ["viewpoint", "scenic_route"] },
];

const personalMapLayers: Array<{ id: PersonalMapLayer; label: string; color: string }> = [
  { id: "favorites", label: "Favorieten", color: "#facc15" },
  { id: "sleepBases", label: "Slaapbases", color: "#be123c" },
  { id: "completed", label: "Gedaan", color: "#94a3b8" },
];

const badWeatherVisibleCategories = new Set<Category>(["city", "stave_church", "scenic_route", "viewpoint"]);
const highlightById = new Map(highlights.map((highlight) => [highlight.id, highlight]));

const priorityStarIcon = divIcon({
  className: "priority-star-marker",
  html: "&#9733;",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

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
    map.flyTo([highlight.lat, highlight.lng], Math.max(map.getZoom(), 8), { duration: 0.65 });
  }, [highlight, map]);

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

function optionIcon(kind: RouteOption["kind"]) {
  if (kind === "actief") return <Mountain size={16} />;
  if (kind === "scenic") return <Compass size={16} />;
  if (kind === "doorreis" || kind === "verder") return <Route size={16} />;
  if (kind === "slechtweer") return <CloudRain size={16} />;
  if (kind === "blijven") return <MapPinned size={16} />;
  return <MapPinned size={16} />;
}

function scoreLabel(score: number) {
  if (score >= 75) return "Topmatch";
  if (score >= 65) return "Sterke match";
  if (score >= 55) return "Logische optie";
  return "Alleen als het past";
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
  const markerRefs = useRef<Record<string, LeafletCircleMarker | null>>({});
  const [settings, setSettings] = useState<PlannerSettings>(() => loadSettings());
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(settings.savedTodayOptionId);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string>(settings.currentHighlightId);
  const [popupHighlightId, setPopupHighlightId] = useState<string | undefined>();
  const [isRouting, setIsRouting] = useState(false);
  const [isPickingStart, setIsPickingStart] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCachingMap, setIsCachingMap] = useState(false);
  const [isLayerWidgetOpen, setIsLayerWidgetOpen] = useState(false);
  const [offlineMapMessage, setOfflineMapMessage] = useState<string | undefined>();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

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
  const currentHighlight = settings.customStart
    ? makeCustomStart(settings.customStart.lat, settings.customStart.lng, settings.customStart.name)
    : selectedDatasetHighlight;

  const selectedOption = routeOptions.find((option) => option.id === selectedOptionId);
  const focusedHighlight =
    settings.customStart && selectedHighlightId.startsWith("custom-start-")
      ? currentHighlight
      : highlightById.get(selectedHighlightId);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (highlight: Highlight) => {
    if (!normalizedSearch) return true;
    const haystack = [
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
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  };

  const matchesSleepBase = (sleepBase: SleepBase) => {
    if (!normalizedSearch) return true;
    const haystack = [
      sleepBase.name,
      sleepBase.region,
      sleepBase.description,
      sleepBase.tripMoment,
      sleepBase.note,
      ...sleepBase.bestFor,
      ...sleepBase.dayTrips,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
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

  function clearCurrentRouteOptions() {
    setRouteOptions([]);
    setSelectedOptionId(undefined);
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

    const urls = buildOfflineTileUrls();
    setIsCachingMap(true);
    worker.postMessage({ type: "CACHE_TILES", urls });
    window.setTimeout(() => {
      setIsCachingMap(false);
      setOfflineMapMessage(
        `${urls.length} kaarttegels voorbereid voor overzichtszoom. Detailtegels werken offline nadat je ze online hebt bekeken.`,
      );
    }, 1800);
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
    clearCurrentRouteOptions();
    setIsPickingStart(false);
  }

  async function showOptions() {
    setIsPickingStart(false);
    setMapFocusMode(false);
    setIsRouting(true);
    try {
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
    clearCurrentRouteOptions();
  }

  function viewHighlight(highlight: Highlight) {
    setSelectedHighlightId(highlight.id);
    setSettings((current) => ({
      ...current,
      recentlyViewedHighlightIds: [
        highlight.id,
        ...current.recentlyViewedHighlightIds.filter((id) => id !== highlight.id),
      ].slice(0, 6),
    }));
  }

  function openHighlightPopup(highlight: Highlight) {
    viewHighlight(highlight);
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
              className="map-action-button"
              type="button"
              onClick={prepareOfflineMap}
              disabled={isCachingMap || !isOnline}
              title="Bewaar compacte kaartbasis voor offline gebruik"
            >
              <Download size={16} />
              <span>{isCachingMap ? "Opslaan..." : "Kaartbasis"}</span>
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
          {!!searchResults.length && (
            <div className="map-search-results">
              {searchResults.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  onClick={() => {
                    viewHighlight(highlight);
                    setSearchQuery("");
                    setPopupHighlightId(highlight.id);
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
          {(offlineMapMessage || locationMessage) && (
            <div className="map-cluster-message">
              {offlineMapMessage && <p>{offlineMapMessage}</p>}
              {locationMessage && <p>{locationMessage}</p>}
            </div>
          )}
          {isLayerWidgetOpen && (
            <div className="map-layer-popover">
              <span className="layer-group-label">Kaartlagen</span>
              {mapLayerGroups.map((layer) => {
                const isChecked = layer.categories.every((category) => enabledCategorySet.has(category));
                const swatch = Array.from(new Set(layer.categories.map((category) => categoryColors[category])));
                return (
                  <label key={layer.id} className="map-layer-toggle">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleLayerGroup(layer.categories)}
                    />
                    <span style={{ background: swatch[0] }} />
                    {layer.label}
                  </label>
                );
              })}
              <span className="layer-group-label">Persoonlijk</span>
              {personalMapLayers.map((layer) => (
                <label key={layer.id} className="map-layer-toggle">
                  <input
                    type="checkbox"
                    checked={enabledPersonalLayerSet.has(layer.id)}
                    onChange={() => togglePersonalLayer(layer.id)}
                  />
                  <span style={{ background: layer.color }} />
                  {layer.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <MapContainer center={[60.72, 6.9]} zoom={6} minZoom={5} maxZoom={15} zoomControl={false} className="map">
          <MapClickPicker enabled={isPickingStart} onPick={setCustomStart} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredHighlights.map((highlight) => {
            const isCurrent = highlight.id === currentHighlight.id;
            const isSelected = highlight.id === selectedHighlightId;
            const isPriority = priorityHighlightIdSet.has(highlight.id);
            const isCompleted = completedHighlightIdSet.has(highlight.id);
            return (
              <Fragment key={highlight.id}>
              <CircleMarker
                ref={(marker) => {
                  markerRefs.current[highlight.id] = marker;
                }}
                center={[highlight.lat, highlight.lng]}
                radius={isCurrent ? 12 : isSelected ? 10 : highlight.importance === "must-see" ? 8 : 7}
                pathOptions={{
                  color: isCompleted ? "#94a3b8" : isCurrent ? "#111827" : "#ffffff",
                  weight: isCurrent ? 3 : 2,
                  fillColor: categoryColors[highlight.category],
                  fillOpacity: isCompleted ? 0.28 : 0.95,
                  opacity: isCompleted ? 0.55 : 1,
                }}
                eventHandlers={{ click: () => viewHighlight(highlight) }}
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
                    {highlight.imageUrl && (
                      <>
                        <img className="popup-image" src={highlight.imageUrl} alt={highlight.imageAlt ?? highlight.name} loading="lazy" />
                        {highlight.imageCredit && <small className="image-credit">{highlight.imageCredit}</small>}
                      </>
                    )}
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
                    {!!highlight.detail?.length && (
                      <details className="popup-details">
                        <summary>Waarom interessant</summary>
                        {highlight.detail.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </details>
                    )}
                    {highlight.contentTips && (
                      <details className="popup-details">
                        <summary>Wanneer wel/niet</summary>
                        <div className="content-fit-tags">
                          {highlight.contentTips.fits.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <p><strong>Beste moment:</strong> {highlight.contentTips.bestMoment}</p>
                        <p><strong>Overslaan als:</strong> {highlight.contentTips.skipWhen}</p>
                      </details>
                    )}
                    {(highlight.note || highlight.navigationLabel || highlight.contentTips?.logistics) && (
                      <details className="popup-details">
                        <summary>Praktisch</summary>
                        {highlight.note && <p className="note">{highlight.note}</p>}
                        {highlight.contentTips?.logistics ? (
                          <p className="note">{highlight.contentTips.logistics}</p>
                        ) : highlight.navigationLabel && (
                          <p className="note">
                            Navigatie: {highlight.navigationLabel}
                            {highlight.navigationNote ? ` - ${highlight.navigationNote}` : ""}
                          </p>
                        )}
                      </details>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
              {enabledPersonalLayerSet.has("favorites") && isPriority && !isCurrent && !isCompleted && (
                <Marker
                  position={[highlight.lat, highlight.lng]}
                  icon={priorityStarIcon}
                  interactive={false}
                  keyboard={false}
                />
              )}
              </Fragment>
            );
          })}

          {visibleSleepBases.map((sleepBase) => (
            <CircleMarker
              key={sleepBase.id}
              center={[sleepBase.lat, sleepBase.lng]}
              radius={9}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: "#be123c",
                fillOpacity: 0.92,
              }}
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
                  <p>{sleepBase.description}</p>
                  <div className="sleepbase-tags">
                    {sleepBase.bestFor.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <details className="popup-details" open>
                    <summary>Waarom hier slapen</summary>
                    <p>{sleepBase.tripMoment}</p>
                    <p className="note">{sleepBase.note}</p>
                  </details>
                  <details className="popup-details">
                    <summary>Logische dagtrips</summary>
                    <p>{sleepBase.dayTrips.join(", ")}</p>
                  </details>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setCustomStart(sleepBase.lat, sleepBase.lng, sleepBase.name)}
                  >
                    Start vanaf deze slaapbasis
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {settings.customStart && (
            <CircleMarker
              center={[settings.customStart.lat, settings.customStart.lng]}
              radius={12}
              pathOptions={{
                color: "#111827",
                weight: 3,
                fillColor: "#facc15",
                fillOpacity: 1,
              }}
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
            </CircleMarker>
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
              <CircleMarker
                center={getNavigationPosition(highlight)}
                radius={8}
                pathOptions={{
                  color: "#0f766e",
                  weight: 3,
                  fillColor: "#ffffff",
                  fillOpacity: 1,
                }}
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
              </CircleMarker>
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
        <header className="panel-header">
          <div>
            <span className="eyebrow">EV roadtrip - 16 dagen</span>
            <h1>Beslis per dag waar je heen gaat</h1>
            <span className={isOnline ? "connection-pill online" : "connection-pill offline"}>
              {isOnline
                ? "Online: wegafstanden via OpenStreetMap"
                : "Offline: app/data werken, rijtijden zijn schattingen"}
            </span>
          </div>
          <button className="icon-button" type="button" onClick={resetFilters} aria-label="Reset filters">
            <RotateCcw size={18} />
          </button>
        </header>

        <section className="control-section">
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
            <label htmlFor="drive-hours">Gewenste rijtijd vandaag</label>
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
          <div className="segmented">
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
          <p className="microcopy">Gebruik Heen/noord tot Geiranger of Atlantic Road; zet Terug aan zodra Oslo, Telemark of Kristiansand weer logisch wordt.</p>
        </section>

        <section className="control-section region-mockup">
          <div className="section-title">
            <MapPinned size={17} />
            <h2>Regiokaart mock-up</h2>
          </div>
          <div className="region-card-preview">
            <div>
              <span>Voorbeeld</span>
              <strong>Hardanger</strong>
              <p>Watervallen, fruitdorpen, fjordarmen en korte hikes. Sterk voor rustige scenic dagen of een actieve dag rond Odda.</p>
            </div>
            <div className="region-action-grid">
              <button type="button">Korte stops</button>
              <button type="button">Actief</button>
              <button type="button">Regenproof</button>
              <button type="button">Verder reizen</button>
            </div>
            <p className="microcopy"><strong>Logisch hierna:</strong> Bergen, Sognefjord of Telemark terugroute. <strong>Let op:</strong> Trolltunga is een aparte hoofddag.</p>
          </div>
        </section>


        <section className="control-section ev-box">
          <div className="section-title">
            <Zap size={17} />
            <h2>Peugeot E-3008 EV-marges</h2>
          </div>
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
            EV-inschattingen zijn indicatief en gebruiken geen actuele laadpaaldata. Controleer echte laadstops
            onderweg in een actuele laadapp.
          </p>
        </section>

        <div className="action-row">
          <button className="primary-button" type="button" onClick={showOptions} disabled={isRouting}>
            <Route size={18} />
            {isRouting ? "Routes berekenen..." : "Geef opties voor vandaag"}
          </button>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>

        <section className="options-section">
          <div className="section-title">
            <Compass size={17} />
            <h2>Routevoorstellen</h2>
          </div>

          {!routeOptions.length && (
            <div className="empty-state">
              Kies een startpunt op de kaart, via GPS of met prikpunt. Daarna verschijnen dagopties met stops op de kaart.
            </div>
          )}

          {routeOptions.map((option) => (
            <article
              key={option.id}
              className={`route-card ${selectedOptionId === option.id ? "selected" : ""}`}
              onClick={() => {
                setSelectedOptionId(option.id);
                updateSettings({ savedTodayOptionId: option.id });
              }}
            >
              <header>
                <span className="kind-chip">
                  {optionIcon(option.kind)}
                  {option.kind}
                </span>
                <div className="score-stack">
                  <span className="score-pill">
                    <Gauge size={15} />
                    {scoreLabel(option.score)}
                  </span>
                  <span className={option.fitsDriveWindow ? "fit good" : "fit warn"}>
                    {option.fitsDriveWindow ? "past" : "ambitieus"}
                  </span>
                </div>
              </header>
              <h3>{option.title}</h3>
              <p className="route-guide">{option.guideText}</p>
              {!!option.offlineLabels.length && (
                <div className="route-labels" aria-label="Offline route-indicaties">
                  {option.offlineLabels.slice(0, 3).map((label) => (
                    <span key={label.label} className={`route-label ${label.tone}`} title={label.description}>
                      {label.label}
                    </span>
                  ))}
                  {option.offlineLabels.length > 3 && <span className="route-label neutral">+{option.offlineLabels.length - 3}</span>}
                </div>
              )}
              {option.stops[0]?.highlight.imageUrl && (
                <div className="route-visual">
                  <img
                    src={option.stops[0].highlight.imageUrl}
                    alt={option.stops[0].highlight.imageAlt ?? option.stops[0].highlight.name}
                    loading="lazy"
                  />
                  <div>
                    <strong>{option.stops[0].highlight.name}</strong>
                    <p>{option.stops[0].highlight.detail?.[0] ?? option.stops[0].highlight.description}</p>
                    {option.stops[0].highlight.imageCredit && (
                      <small className="image-credit">{option.stops[0].highlight.imageCredit}</small>
                    )}
                  </div>
                </div>
              )}
              <dl className="stats">
                <div>
                  <dt>Rijtijd</dt>
                  <dd>{formatHours(option.estimatedDriveHours)}</dd>
                </div>
                <div>
                  <dt>Afstand</dt>
                  <dd>{option.estimatedDistanceKm} km</dd>
                </div>
                <div className="stat-type">
                  <dt>Type</dt>
                  <dd>{option.activityType}</dd>
                </div>
              </dl>
              <details className="score-panel">
                <summary>
                  <span>Waarom deze positie?</span>
                  <em>Details</em>
                </summary>
                <p className="exact-score">
                  Score {option.score}/100 op basis van rijtijd, spreiding, must-see waarde, EV-risico en reisritme.
                </p>
                <p>{option.rankingReason}</p>
                <p className="route-source">
                  {option.routeSource === "osrm"
                    ? "Afstand en rijtijd via online routeberekening over OpenStreetMap-wegen."
                    : "Afstand en rijtijd via fallbackschatting; geen wegennet gebruikt."}
                </p>
                {option.stops.some((stop) => hasNavigationTarget(stop.highlight)) && (
                  <p className="route-source">
                    De zwarte routelijn stopt bij praktische navigatiepunten. De gekleurde landmark-marker kan dus
                    iets verderop liggen.
                  </p>
                )}
                {!!option.offlineLabels.length && (
                  <div className="offline-label-panel">
                    <strong>Offline route-indicatie</strong>
                    <ul>
                      {option.offlineLabels.map((label) => (
                        <li key={label.label}>
                          <span className={`route-label ${label.tone}`}>{label.label}</span>
                          <p>{label.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="score-grid" aria-label="Score-opbouw">
                  <span>Rijtijd <strong>{option.scoreBreakdown.driveTime}</strong></span>
                  <span>Spreiding <strong>{option.scoreBreakdown.activitySpread}</strong></span>
                  <span>Must-see <strong>{option.scoreBreakdown.mustSee}</strong></span>
                  <span>EV-risico <strong>{option.scoreBreakdown.evRisk}</strong></span>
                  <span>Ritme <strong>{option.scoreBreakdown.rhythm}</strong></span>
                </div>
                <ul className="score-notes">
                  {option.scoreNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
              <div className={`ev-message ${option.evLevel}`}>
                <BatteryCharging size={16} />
                {option.evMessage}
              </div>
              <div className="stops">
                {option.stops.slice(0, 3).map((stop) => (
                  <button
                    key={stop.highlight.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openHighlightPopup(stop.highlight);
                    }}
                  >
                    <span className="stop-main">
                      <strong>{stop.highlight.name}</strong>
                      {priorityHighlightIdSet.has(stop.highlight.id) && !completedHighlightIdSet.has(stop.highlight.id) && (
                        <em>
                          <Star size={13} />
                          Zeker doen
                        </em>
                      )}
                      {hasNavigationTarget(stop.highlight) && (
                        <em>
                          <Flag size={13} />
                          Navigeer naar: {navigationTargetText(stop.highlight)}
                        </em>
                      )}
                    </span>
                    <span>{stop.distanceFromStartKm} km</span>
                  </button>
                ))}
                {option.stops.length > 3 && (
                  <div className="more-stops-note">+{option.stops.length - 3} extra stop in details</div>
                )}
              </div>
              <details className="more-info">
                <summary>Waarom deze stops?</summary>
                <div className="stop-context-list">
                  {option.stops.map((stop) => (
                    <article key={`context-${stop.highlight.id}`} className="stop-context">
                      {stop.highlight.imageUrl && (
                        <img src={stop.highlight.imageUrl} alt={stop.highlight.imageAlt ?? stop.highlight.name} loading="lazy" />
                      )}
                      <div>
                        <strong>{stop.highlight.name}</strong>
                        {(stop.highlight.detail ?? [stop.highlight.description]).slice(0, 2).map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                        {stop.highlight.contentTips && (
                          <p className="stop-tip">
                            <strong>Beste moment:</strong> {stop.highlight.contentTips.bestMoment}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
              <details className="more-info">
                <summary>Wanneer kiezen en waarschuwingen</summary>
                <p className="microcopy"><strong>Wel kiezen:</strong> {option.whenToChoose}</p>
                <p className="microcopy"><strong>Alternatief:</strong> {option.alternative}</p>
                {!!option.warnings.length && (
                  <ul className="warnings">
                    {option.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </details>
            </article>
          ))}
        </section>
        </div>
      </aside>
    </main>
  );
}

export default App;
