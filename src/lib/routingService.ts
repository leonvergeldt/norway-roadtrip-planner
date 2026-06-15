import type { Highlight } from "../types";

type RouteSource = "osrm" | "estimated";

export interface RouteEstimate {
  distanceKm: number;
  durationHours: number;
  source: RouteSource;
  routePath?: Array<[number, number]>;
  warnings: string[];
}

interface OsrmStep {
  mode?: string;
  name?: string;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: {
    coordinates?: Array<[number, number]>;
  };
  legs?: Array<{
    steps?: OsrmStep[];
  }>;
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
  message?: string;
}

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const CACHE_PREFIX = "norway-road-route:v2:";

function routePoint(point: Highlight) {
  return {
    lat: point.navigationLat ?? point.lat,
    lng: point.navigationLng ?? point.lng,
    label: point.navigationLabel ?? point.name,
    usesNavigationTarget: point.navigationLat !== undefined && point.navigationLng !== undefined,
  };
}

function routeCacheKey(points: Highlight[]) {
  return `${CACHE_PREFIX}${points
    .map((point) => {
      const target = routePoint(point);
      return `${point.id}@${target.lat.toFixed(5)},${target.lng.toFixed(5)}`;
    })
    .join(">")}`;
}

function readCache(key: string): RouteEstimate | undefined {
  if (typeof localStorage === "undefined") return undefined;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as RouteEstimate;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, estimate: RouteEstimate) {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(key, JSON.stringify(estimate));
  } catch {
    // Cache is a convenience only; route calculation should keep working without it.
  }
}

function fallbackEstimate(
  fallbackDistanceKm: number,
  fallbackDurationHours: number,
  reason: string,
): RouteEstimate {
  return {
    distanceKm: Math.round(fallbackDistanceKm),
    durationHours: Number(fallbackDurationHours.toFixed(1)),
    source: "estimated",
    warnings: [
      `Afstand/rijtijd is een fallback: ${reason}`,
      "Deze schatting gebruikt geen wegennet, ferries of actuele wegstatus.",
    ],
  };
}

function detectFerry(route: OsrmRoute) {
  const steps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
  return steps.some((step) => {
    const haystack = `${step.mode ?? ""} ${step.name ?? ""}`.toLowerCase();
    return haystack.includes("ferry") || haystack.includes("ferje");
  });
}

export async function getRoadRouteEstimate(
  points: Highlight[],
  fallbackDistanceKm: number,
  fallbackDurationHours: number,
): Promise<RouteEstimate> {
  if (points.length < 2) {
    return fallbackEstimate(fallbackDistanceKm, fallbackDurationHours, "te weinig routepunten");
  }

  const cacheKey = routeCacheKey(points);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const routePoints = points.map(routePoint);
  const coordinates = routePoints.map((point) => `${point.lng},${point.lat}`).join(";");
  const url = `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=false`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return fallbackEstimate(fallbackDistanceKm, fallbackDurationHours, `OSRM gaf HTTP ${response.status}`);
    }

    const payload = (await response.json()) as OsrmResponse;
    const route = payload.routes?.[0];
    if (payload.code !== "Ok" || !route) {
      return fallbackEstimate(fallbackDistanceKm, fallbackDurationHours, payload.message ?? "geen route gevonden");
    }

    const routePath = route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]);
    const hasFerry = detectFerry(route);
    const navigationTargets = routePoints.filter((point) => point.usesNavigationTarget);
    const estimate: RouteEstimate = {
      distanceKm: Math.round(route.distance / 1000),
      durationHours: Number((route.duration / 3600).toFixed(1)),
      source: "osrm",
      routePath,
      warnings: [
        "Afstand/rijtijd komt uit OSRM op basis van OpenStreetMap-wegen.",
        ...(navigationTargets.length
          ? [
              `Route gebruikt praktische navigatiepunten: ${navigationTargets
                .map((point) => point.label)
                .join(", ")}.`,
            ]
          : []),
        "Geen live verkeer, ferry-afvaarten, tijdelijke wegsluitingen of seizoensopeningen.",
        ...(hasFerry ? ["Route bevat waarschijnlijk een ferrysegment; check actuele vaartijden."] : []),
      ],
    };

    writeCache(cacheKey, estimate);
    return estimate;
  } catch {
    return fallbackEstimate(fallbackDistanceKm, fallbackDurationHours, "OSRM was niet bereikbaar");
  } finally {
    window.clearTimeout(timeout);
  }
}
