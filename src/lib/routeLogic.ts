import { highlights } from "../data/highlights";
import { getRoadRouteEstimate } from "./routingService";
import type { EvSettings, Highlight, RouteOption, RouteOptionKind, TravelStyle, TripDirection } from "../types";

const AVERAGE_ROAD_SPEED_KMH = 68;
const ABSOLUTE_RECOMMENDATION_LIMIT_HOURS = 5.2;
const MAX_ROUTE_OPTIONS = 5;

const regionProgress: Record<string, number> = {
  Sorlandet: 0,
  Stavanger: 20,
  Rogaland: 24,
  Lysefjord: 28,
  Ryfylke: 34,
  Hardanger: 43,
  Bergen: 52,
  Sognefjord: 62,
  Jostedalen: 68,
  Nordfjord: 72,
  Geiranger: 82,
  "More og Romsdal": 86,
  Romsdal: 88,
  "Atlantic Road": 94,
  Telemark: 14,
  Gudbrandsdal: 70,
  Gudbrandsdalen: 66,
  Lillehammer: 38,
  Mjosa: 28,
  Oslo: 18,
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: Highlight, b: Highlight) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  const straightLine = 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
  return straightLine * 1.35;
}

function estimateDriveHours(distance: number) {
  return distance / AVERAGE_ROAD_SPEED_KMH;
}

function routeProgress(highlight: Highlight): number {
  if (regionProgress[highlight.region] !== undefined) return regionProgress[highlight.region];

  let nearest: Highlight | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const item of highlights) {
    if (item.id === highlight.id || regionProgress[item.region] === undefined) continue;
    const distance = distanceKm(highlight, item);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  return nearest ? regionProgress[nearest.region] : 45;
}

function directionDelta(current: Highlight, target: Highlight) {
  return routeProgress(target) - routeProgress(current);
}

function directionScore(current: Highlight, target: Highlight, tripDirection: TripDirection) {
  if (tripDirection === "flexible") return 0;

  const delta = directionDelta(current, target);

  if (tripDirection === "outbound") {
    if (delta < -6) return -16;
    if (delta < 0) return -6;
    if (delta >= 6) return Math.min(8, delta / 5);
    return 2;
  }

  if (delta > 6) return -16;
  if (delta > 0) return -6;
  if (delta <= -6) return Math.min(8, Math.abs(delta) / 5);
  return 2;
}

function isDirectionallyAllowed(current: Highlight, target: Highlight, tripDirection: TripDirection) {
  if (tripDirection === "flexible") return true;

  const delta = directionDelta(current, target);
  if (Math.abs(delta) <= 4) return true;

  return tripDirection === "outbound" ? delta > 0 : delta < 0;
}

function isLocalStayCandidate(current: Highlight, target: Highlight) {
  return current.region === target.region || Math.abs(directionDelta(current, target)) <= 4;
}

function directionRhythmScore(current: Highlight, target: Highlight, tripDirection: TripDirection) {
  if (tripDirection === "flexible") return 76;
  return directionScore(current, target, tripDirection) < -4 ? 32 : 88;
}

function styleScore(highlight: Highlight, style: TravelStyle) {
  if (style === "slechtweer") {
    const badWeatherBoost = ["city", "stave_church", "scenic_route", "viewpoint"].includes(
      highlight.category,
    )
      ? 3
      : 0;
    const longHikePenalty = highlight.category === "hike" && highlight.visitTimeHours > 3 ? -4 : 0;
    return (highlight.styles.includes("slechtweer") ? 4 : 0) + badWeatherBoost + longHikePenalty;
  }

  if (style === "stad") {
    return (highlight.styles.includes("stad") || highlight.styles.includes("cultuur") ? 4 : 0) +
      (highlight.category === "city" ? 2 : 0);
  }

  if (style === "scenic") {
    return (highlight.styles.includes("scenic") || highlight.styles.includes("natuur") ? 5 : 0) +
      (["fjord", "viewpoint", "scenic_route"].includes(highlight.category) ? 2 : 0);
  }

  return highlight.styles.includes(style) ? 5 : 0;
}

function importanceScore(highlight: Highlight) {
  if (highlight.importance === "must-see") return 4;
  if (highlight.importance === "aanbevolen") return 2;
  return 0;
}

function personalPriorityScore(highlight: Highlight, priorityHighlightIdSet: Set<string>) {
  return priorityHighlightIdSet.has(highlight.id) ? 7 : 0;
}

function routeEvMessage(distance: number, ev: EvSettings, mountainRoute: boolean) {
  const usableRange =
    ev.practicalRangeKm *
    (1 - ev.safetyMarginPercent / 100) *
    (1 - ev.minArrivalBatteryPercent / 100);
  const mountainAdjustedRange = mountainRoute ? usableRange * 0.88 : usableRange;

  if (distance > ev.maxDistanceWithoutChargingKm || distance > mountainAdjustedRange) {
    return {
      evLevel: "caution" as const,
      evMessage: mountainRoute
        ? "Waarschijnlijk laadstop nodig; lange of bergachtige rit, houd extra marge aan."
        : "Waarschijnlijk laadstop nodig volgens je ingestelde marges.",
    };
  }

  if (distance > mountainAdjustedRange * 0.75 || mountainRoute) {
    return {
      evLevel: "watch" as const,
      evMessage: mountainRoute
        ? "Route lijkt haalbaar, maar bergwegen vragen extra marge."
        : "Route past waarschijnlijk binnen bereik, maar check laden onderweg.",
    };
  }

  return {
    evLevel: "ok" as const,
    evMessage: "Route lijkt comfortabel binnen je ingestelde EV-bereik.",
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countDistinctCategories(stops: Highlight[]) {
  return new Set(stops.map((stop) => stop.category)).size;
}

function scoreDriveTime(driveHours: number, maxDriveHours: number, kind: RouteOptionKind) {
  if (kind === "blijven") {
    const softLimit = Math.min(1.8, maxDriveHours);
    const overLimitPenalty = driveHours > softLimit ? (driveHours - softLimit) * 28 : 0;
    return clampScore(100 - driveHours * 18 - overLimitPenalty);
  }

  const idealHours = kind === "doorreis" ? Math.min(3.4, maxDriveHours + 0.4) : Math.min(2.4, maxDriveHours);
  const difference = Math.abs(driveHours - idealHours);
  const overLimitPenalty = driveHours > maxDriveHours ? (driveHours - maxDriveHours) * 22 : 0;
  return clampScore(100 - difference * 24 - overLimitPenalty);
}

function scoreActivitySpread(stops: Highlight[], dayStyle: TravelStyle, kind: RouteOptionKind) {
  const categoryScore = Math.min(3, countDistinctCategories(stops)) * 22;
  const styleMatches = stops.filter((stop) => {
    if (dayStyle === "stad") return stop.styles.includes("stad") || stop.styles.includes("cultuur");
    if (dayStyle === "scenic") return stop.styles.includes("scenic") || stop.styles.includes("natuur");
    return stop.styles.includes(dayStyle);
  }).length;
  const styleScoreValue = Math.min(2, styleMatches) * 14;
  const overloadPenalty = stops.length > 3 ? 14 : 0;
  const rainyHikePenalty =
    dayStyle === "slechtweer" && stops.some((stop) => stop.category === "hike") ? 24 : 0;
  const shortDayBonus = (kind === "kort" || kind === "blijven") && stops.length <= 2 ? 8 : 0;

  return clampScore(categoryScore + styleScoreValue + shortDayBonus - overloadPenalty - rainyHikePenalty);
}

function scoreMustSee(stops: Highlight[], priorityHighlightIds: string[]) {
  return clampScore(
    stops.reduce((total, stop) => {
      const priorityBonus = priorityHighlightIds.includes(stop.id) ? 28 : 0;
      if (stop.importance === "must-see") return total + 42 + priorityBonus;
      if (stop.importance === "aanbevolen") return total + 22 + priorityBonus;
      return total + 8 + priorityBonus;
    }, 0),
  );
}

function scoreEvRisk(evLevel: RouteOption["evLevel"], distance: number, ev: EvSettings) {
  const base = evLevel === "ok" ? 95 : evLevel === "watch" ? 68 : 34;
  const distancePenalty = distance > ev.maxDistanceWithoutChargingKm ? 18 : 0;
  return clampScore(base - distancePenalty);
}

function scoreRhythm(
  kind: RouteOptionKind,
  driveHours: number,
  maxDriveHours: number,
  stops: Highlight[],
  dayStyle: TravelStyle,
  current: Highlight,
  tripDirection: TripDirection,
) {
  let score = 72;

  if (kind === "kort" && dayStyle === "rustig") score += 18;
  if (kind === "actief" && dayStyle === "actief") score += 18;
  if (kind === "scenic" && dayStyle === "scenic") score += 18;
  if (kind === "slechtweer" && dayStyle === "slechtweer") score += 20;
  if (kind === "doorreis" && driveHours >= 2 && driveHours <= maxDriveHours + 0.5) score += 10;
  if (kind === "blijven" && ["rustig", "slechtweer", "scenic"].includes(dayStyle)) score += 20;
  if (stops.some((stop) => stop.category === "hike") && stops.some((stop) => stop.category === "city")) score -= 10;
  if (driveHours > maxDriveHours) score -= 18;
  if (stops.length === 1 && kind !== "blijven") score -= 8;

  const directionScores = stops.map((stop) => directionRhythmScore(current, stop, tripDirection));
  const directionScoreValue = directionScores.length
    ? Math.min(...directionScores) * 0.65 +
      (directionScores.reduce((total, value) => total + value, 0) / directionScores.length) * 0.35
    : 76;

  return clampScore(score * 0.72 + directionScoreValue * 0.28);
}

function explainScore(
  breakdown: RouteOption["scoreBreakdown"],
  option: {
    kind: RouteOptionKind;
    estimatedDriveHours: number;
    maxDriveHours: number;
    stops: Highlight[];
    evLevel: RouteOption["evLevel"];
    priorityHighlightIds: string[];
  },
) {
  const notes: string[] = [];
  const mustSeeStops = option.stops.filter((stop) => stop.importance === "must-see");
  const priorityStops = option.stops.filter((stop) => option.priorityHighlightIds.includes(stop.id));

  notes.push(
    breakdown.driveTime >= 78
      ? `Rijtijd sluit goed aan op je limiet van ${option.maxDriveHours} uur.`
      : `Rijtijd drukt de score omdat deze minder mooi past bij ${option.maxDriveHours} uur.`,
  );
  notes.push(
    breakdown.activitySpread >= 70
      ? "Stops vullen elkaar goed aan qua activiteitstype."
      : "Activiteiten zijn minder gevarieerd of minder passend bij de gekozen dagstijl.",
  );
  notes.push(
    mustSeeStops.length
      ? `Must-see waarde is hoog door ${mustSeeStops.map((stop) => stop.name).join(", ")}.`
      : "Geen must-see in deze optie; dat maakt hem flexibeler maar minder prioritair.",
  );
  notes.push(
    priorityStops.length
      ? `Persoonlijke prioriteit telt mee door ${priorityStops.map((stop) => stop.name).join(", ")}.`
      : "Geen gemarkeerde zekerheid in deze optie; daardoor krijgt hij geen persoonlijke bonus.",
  );
  notes.push(
    option.evLevel === "ok"
      ? "EV-risico is laag binnen je ingestelde marges."
      : option.evLevel === "watch"
        ? "EV-risico is middelmatig: comfortabel plannen, maar laden onderweg checken."
        : "EV-risico verlaagt de score; waarschijnlijk laadstop of extra marge nodig.",
  );
  notes.push(
    breakdown.rhythm >= 78
      ? "Past goed bij het reisritme van vandaag."
      : "Reisritme is minder vloeiend: let op tempo, energie of timing.",
  );

  return notes;
}

function calculateOptionScore(
  kind: RouteOptionKind,
  estimatedDriveHours: number,
  estimatedDistanceKm: number,
  stops: Highlight[],
  maxDriveHours: number,
  dayStyle: TravelStyle,
  ev: EvSettings,
  evLevel: RouteOption["evLevel"],
  current: Highlight,
  tripDirection: TripDirection,
  priorityHighlightIds: string[],
) {
  const scoreBreakdown = {
    driveTime: scoreDriveTime(estimatedDriveHours, maxDriveHours, kind),
    activitySpread: scoreActivitySpread(stops, dayStyle, kind),
    mustSee: scoreMustSee(stops, priorityHighlightIds),
    evRisk: scoreEvRisk(evLevel, estimatedDistanceKm, ev),
    rhythm: scoreRhythm(kind, estimatedDriveHours, maxDriveHours, stops, dayStyle, current, tripDirection),
  };
  const score = clampScore(
    scoreBreakdown.driveTime * 0.28 +
      scoreBreakdown.activitySpread * 0.18 +
      scoreBreakdown.mustSee * 0.22 +
      scoreBreakdown.evRisk * 0.18 +
      scoreBreakdown.rhythm * 0.14,
  );
  const scoreNotes = explainScore(scoreBreakdown, {
    kind,
    estimatedDriveHours,
    maxDriveHours,
    stops,
    evLevel,
    priorityHighlightIds,
  });
  if (tripDirection !== "flexible") {
    scoreNotes.push(
      tripDirection === "outbound"
        ? "Reisfase Heen/noord staat aan: terugstappen naar het zuiden krijgen minder ritmescore."
        : "Reisfase Terug staat aan: verder noordelijk rijden krijgt minder ritmescore.",
    );
  }
  const rankingReason =
    score >= 82
      ? "Staat hoog omdat inhoud, reisfase en marges samen rustig kloppen."
      : score >= 68
        ? "Staat in de middenmoot: logisch, maar met een duidelijke kanttekening."
        : "Staat lager omdat deze keuze minder vanzelfsprekend voelt binnen het huidige ritme.";

  return { score, scoreBreakdown, scoreNotes, rankingReason };
}

function pickCandidates(
  current: Highlight,
  style: TravelStyle,
  maxDriveHours: number,
  tripDirection: TripDirection,
  priorityHighlightIds: string[] = [],
  completedHighlightIds: string[] = [],
) {
  const maxDistance = maxDriveHours * AVERAGE_ROAD_SPEED_KMH;
  const softMaxHours = Math.min(ABSOLUTE_RECOMMENDATION_LIMIT_HOURS, maxDriveHours + 1.2);
  const priorityHighlightIdSet = new Set(priorityHighlightIds);
  const completedHighlightIdSet = new Set(completedHighlightIds);

  return highlights
    .filter((item) => item.id !== current.id && !completedHighlightIdSet.has(item.id))
    .map((highlight) => {
      const distance = distanceKm(current, highlight);
      const hours = estimateDriveHours(distance);
      const score =
        styleScore(highlight, style) +
        importanceScore(highlight) +
        personalPriorityScore(highlight, priorityHighlightIdSet) +
        Math.max(0, 4 - hours) +
        (hours <= softMaxHours ? 4 : -28) +
        (distance <= maxDistance ? 3 : -6) +
        directionScore(current, highlight, tripDirection);
      return { highlight, distance, hours, score };
    })
    .filter((item) => item.hours <= softMaxHours || priorityHighlightIdSet.has(item.highlight.id))
    .sort((a, b) => b.score - a.score);
}

function optionWarnings(
  kind: RouteOptionKind,
  driveHours: number,
  maxDriveHours: number,
  stops: Highlight[],
) {
  const warnings: string[] = [];

  if (driveHours > maxDriveHours) warnings.push("Ambitieus voor je ingestelde rijtijd.");
  if (driveHours > 4) warnings.push("Veel rijden; alleen logisch als doorreisdag.");
  if (driveHours > ABSOLUTE_RECOMMENDATION_LIMIT_HOURS) {
    warnings.push("Te lang voor een normale dagkeuze; splits deze route op met een tussenstop.");
  }
  if (stops.some((stop) => stop.category === "hike")) {
    warnings.push("Beter alleen bij goed weer en genoeg energie.");
  }
  if (stops.some((stop) => stop.id === "atlantic-road")) {
    warnings.push("Atlantic Road is waarschijnlijk te ambitieus binnen 16 dagen tenzij je noordelijk tempo maakt.");
  }
  if (kind === "slechtweer") warnings.push("Geen live weerdata; kies deze modus zelf bij regen, wind of vermoeidheid.");

  return warnings;
}

async function buildOption(
  current: Highlight,
  kind: RouteOptionKind,
  title: string,
  target: Highlight,
  extraStops: Highlight[],
  maxDriveHours: number,
  ev: EvSettings,
  dayStyle: TravelStyle,
  guideText: string,
  whenToChoose: string,
  alternative: string,
  activityType: string,
  tripDirection: TripDirection,
  priorityHighlightIds: string[],
): Promise<RouteOption> {
  const allStops = [target, ...extraStops].filter(
    (stop, index, array) => array.findIndex((item) => item.id === stop.id) === index,
  );
  const fallbackDistanceKm = Math.round(distanceKm(current, target) + extraStops.length * 18);
  const fallbackDriveHours = Number(estimateDriveHours(fallbackDistanceKm).toFixed(1));
  const routeEstimate = await getRoadRouteEstimate([current, ...allStops], fallbackDistanceKm, fallbackDriveHours);
  const estimatedDistanceKm = routeEstimate.distanceKm;
  const estimatedDriveHours = routeEstimate.durationHours;
  const mountainRoute = allStops.some((stop) =>
    ["Geiranger", "Jotunheimen", "More og Romsdal", "Jostedalen", "Nordfjord"].includes(stop.region),
  );
  const evStatus = routeEvMessage(estimatedDistanceKm, ev, mountainRoute);
  const scoreDetails = calculateOptionScore(
    kind,
    estimatedDriveHours,
    estimatedDistanceKm,
    allStops,
    maxDriveHours,
    dayStyle,
    ev,
    evStatus.evLevel,
    current,
    tripDirection,
    priorityHighlightIds,
  );

  return {
    id: `${kind}-${target.id}`,
    kind,
    title,
    guideText,
    rankingReason: scoreDetails.rankingReason,
    whenToChoose,
    alternative,
    estimatedDriveHours,
    estimatedDistanceKm,
    routeSource: routeEstimate.source,
    routePath: routeEstimate.routePath,
    stops: allStops.map((highlight) => ({
      highlight,
      distanceFromStartKm: Math.round(distanceKm(current, highlight)),
    })),
    activityType,
    score: scoreDetails.score,
    scoreBreakdown: scoreDetails.scoreBreakdown,
    scoreNotes: scoreDetails.scoreNotes,
    fitsDriveWindow: estimatedDriveHours <= maxDriveHours,
    warnings: [...optionWarnings(kind, estimatedDriveHours, maxDriveHours, allStops), ...routeEstimate.warnings],
    ...evStatus,
  };
}

async function buildStayOption(
  current: Highlight,
  dayStyle: TravelStyle,
  maxDriveHours: number,
  ev: EvSettings,
  priorityHighlightIds: string[],
  completedHighlightIds: string[],
): Promise<RouteOption> {
  const localStyle = dayStyle === "slechtweer" ? "slechtweer" : dayStyle === "actief" ? "actief" : "rustig";
  const localStops = pickCandidates(current, localStyle, 1.1, "flexible", priorityHighlightIds, completedHighlightIds)
    .filter((item) => item.hours <= 1.1)
    .filter((item) => isLocalStayCandidate(current, item.highlight))
    .filter((item) => dayStyle !== "slechtweer" || item.highlight.category !== "hike" || item.highlight.visitTimeHours <= 2.5)
    .slice(0, 1)
    .map((item) => item.highlight);
  const allStops = localStops.length || completedHighlightIds.includes(current.id) ? localStops : [current];
  const fallbackDistanceKm = localStops.length
    ? Math.round(localStops.reduce((total, stop) => total + distanceKm(current, stop), 0) + Math.max(0, localStops.length - 1) * 12)
    : 0;
  const fallbackDriveHours = localStops.length ? Number(estimateDriveHours(fallbackDistanceKm).toFixed(1)) : 0;
  const routeEstimate = localStops.length
    ? await getRoadRouteEstimate([current, ...allStops], fallbackDistanceKm, fallbackDriveHours)
    : {
        distanceKm: 0,
        durationHours: 0,
        source: "estimated" as const,
        warnings: [] as string[],
        routePath: undefined,
      };
  const mountainRoute = [current, ...allStops].some((stop) =>
    ["Geiranger", "Jotunheimen", "More og Romsdal", "Jostedalen", "Nordfjord"].includes(stop.region),
  );
  const evStatus = routeEvMessage(routeEstimate.distanceKm, ev, mountainRoute);
  const scoreDetails = calculateOptionScore(
    "blijven",
    routeEstimate.durationHours,
    routeEstimate.distanceKm,
    allStops,
    maxDriveHours,
    dayStyle,
    ev,
    evStatus.evLevel,
    current,
    "flexible",
    priorityHighlightIds,
  );

  return {
    id: `blijven-${current.id}`,
    kind: "blijven",
    title: "Blijf hier nog een dag",
    guideText: localStops.length
      ? `Een dag zonder grote verplaatsing rond ${current.name}. Je houdt ruimte voor rust, boodschappen of spontaan weer, met ${localStops.map((stop) => stop.name).join(" en ")} als logische lokale invulling.`
      : `Een echte rustdag rond ${current.name}. Handig als de omgeving goed voelt, het weer onzeker is of je simpelweg wat lucht in de reis wilt houden.`,
    rankingReason: "Deze optie scoort op reisritme: weinig rijden, lage EV-druk en ruimte om de plek beter te beleven in plaats van meteen door te schuiven.",
    whenToChoose: "Kies dit als de plek goed voelt, je moe bent, het weer wisselt of je vandaag liever kwaliteit dan kilometers wilt.",
    alternative: "Wil je toch vooruit, kies dan de korte dag of scenic optie als zachte verplaatsing.",
    estimatedDriveHours: routeEstimate.durationHours,
    estimatedDistanceKm: routeEstimate.distanceKm,
    routeSource: routeEstimate.source,
    routePath: routeEstimate.routePath,
    stops: allStops.map((highlight) => ({
      highlight,
      distanceFromStartKm: Math.round(distanceKm(current, highlight)),
    })),
    activityType: "Rustdag lokaal",
    score: clampScore(scoreDetails.score + (dayStyle === "rustig" || dayStyle === "slechtweer" ? 8 : 3)),
    scoreBreakdown: scoreDetails.scoreBreakdown,
    scoreNotes: [
      "Deze optie krijgt bewust ritmebonus omdat niet verplaatsen soms de beste roadtrip-keuze is.",
      ...scoreDetails.scoreNotes,
    ],
    fitsDriveWindow: routeEstimate.durationHours <= maxDriveHours,
    warnings: routeEstimate.warnings,
    ...evStatus,
  };
}
export async function generateRouteOptions(
  current: Highlight,
  dayStyle: TravelStyle,
  maxDriveHours: number,
  ev: EvSettings,
  tripDirection: TripDirection = "flexible",
  priorityHighlightIds: string[] = [],
  completedHighlightIds: string[] = [],
): Promise<RouteOption[]> {
  const fallbackCandidates = pickCandidates(current, dayStyle, maxDriveHours, tripDirection, priorityHighlightIds, completedHighlightIds).filter((item) =>
    isDirectionallyAllowed(current, item.highlight, tripDirection),
  );
  const fallbackHighlight = fallbackCandidates[0]?.highlight;
  const stayOptionPromise = buildStayOption(current, dayStyle, maxDriveHours, ev, priorityHighlightIds, completedHighlightIds);

  if (!fallbackHighlight) return [await stayOptionPromise];

  type Candidate = ReturnType<typeof pickCandidates>[number];

  const uniqueCandidateHighlights = (items: Candidate[], limit: number) => {
    const seen = new Set<string>();
    const result: Highlight[] = [];

    for (const item of items) {
      if (seen.has(item.highlight.id)) continue;
      seen.add(item.highlight.id);
      result.push(item.highlight);
      if (result.length >= limit) break;
    }

    return result;
  };

  const candidatesFor = (
    categories: Highlight["category"][] | undefined,
    style: TravelStyle,
    driveHours: number,
    limit: number,
    predicate?: (item: Candidate) => boolean,
  ) => {
    const candidates = pickCandidates(current, style, driveHours, tripDirection, priorityHighlightIds, completedHighlightIds)
      .filter((item) => isDirectionallyAllowed(current, item.highlight, tripDirection))
      .filter((item) => !categories || categories.includes(item.highlight.category))
      .filter((item) => (predicate ? predicate(item) : true));

    return uniqueCandidateHighlights(candidates, limit);
  };

  const ensureTargets = (targets: Highlight[]) => (targets.length ? targets : [fallbackHighlight]);

  const shortTargets = ensureTargets(
    candidatesFor(undefined, "rustig", Math.min(maxDriveHours, 2.2), 2, (item) =>
      item.hours <= Math.min(maxDriveHours, 2.4),
    ),
  );
  const activeTargets = ensureTargets(
    candidatesFor(["hike", "kayak", "viewpoint"], "actief", maxDriveHours, 2),
  );
  const scenicTargets = ensureTargets(
    candidatesFor(["scenic_route", "fjord", "viewpoint"], "scenic", maxDriveHours, 2),
  );
  const transitTargets = ensureTargets(
    candidatesFor(undefined, dayStyle, Math.min(4, maxDriveHours + 0.8), 2, (item) =>
      item.hours >= Math.min(2, maxDriveHours * 0.65),
    ),
  );
  const badWeatherTargets = ensureTargets(
    candidatesFor(["city", "stave_church", "scenic_route", "viewpoint"], "slechtweer", maxDriveHours, 2),
  );

  const referenceScenicTarget = scenicTargets[0];
  const referenceBadWeatherTarget = badWeatherTargets[0];

  const nearbyFor = (target: Highlight, style: TravelStyle, limit: number) => {
    const chosen: Highlight[] = [];
    const usedCategories = new Set<Highlight["category"]>([target.category]);

    for (const item of pickCandidates(target, style, 1.15, "flexible", priorityHighlightIds, completedHighlightIds)) {
      const highlight = item.highlight;
      if (highlight.id === current.id || highlight.id === target.id) continue;
      if (item.hours > 1.35) continue;
      if (!isDirectionallyAllowed(current, highlight, tripDirection)) continue;
      if (usedCategories.has(highlight.category) && chosen.length > 0) continue;

      chosen.push(highlight);
      usedCategories.add(highlight.category);
      if (chosen.length >= limit) break;
    }

    return chosen;
  };

  const routeOptionPromises: Array<Promise<RouteOption>> = [stayOptionPromise];

  shortTargets.forEach((target, index) => {
    routeOptionPromises.push(
      buildOption(
        current,
        "kort",
        index === 0 ? `Korte dag richting ${target.name}` : `Korte optie: ${target.name}`,
        target,
        nearbyFor(target, "rustig", 1),
        maxDriveHours,
        ev,
        dayStyle,
        "Een zachte dag met genoeg lucht om onderweg van gedachten te veranderen. Denk aan een mooie stop, rustig tempo en ruimte om ergens wat langer te blijven hangen.",
        "Kies dit bij een late start, vermoeidheid of als de huidige omgeving eigenlijk nog te goed voelt om snel te verlaten.",
        `Als dit te weinig richting geeft, kijk dan naar de scenic optie via ${referenceScenicTarget.name}.`,
        "Rustige stop",
        tripDirection,
        priorityHighlightIds,
      ),
    );
  });

  activeTargets.forEach((target, index) => {
    routeOptionPromises.push(
      buildOption(
        current,
        "actief",
        index === 0 ? `Actieve dag bij ${target.name}` : `Actieve optie: ${target.name}`,
        target,
        nearbyFor(target, "natuur", 1),
        maxDriveHours,
        ev,
        dayStyle,
        "Deze dag draait om een duidelijk buitenmoment. Je kiest hem omdat je zin hebt in frisse lucht, uitzicht en een bestemming die echt als hoofdmoment voelt.",
        "Kies dit bij stabiel weer en genoeg energie om de activiteit ontspannen te beleven.",
        `Bij twijfel is ${referenceBadWeatherTarget.name} de nuchtere fallback.`,
        "Hike/outdoor",
        tripDirection,
        priorityHighlightIds,
      ),
    );
  });

  scenicTargets.forEach((target, index) => {
    routeOptionPromises.push(
      buildOption(
        current,
        "scenic",
        index === 0 ? `Scenic dag via ${target.name}` : `Scenic optie: ${target.name}`,
        target,
        nearbyFor(target, "scenic", 2),
        maxDriveHours,
        ev,
        dayStyle,
        "Dit is de landschapsdag: fjorden, uitzichtpunten, kades of stille wegen krijgen de hoofdrol. Niet alles hoeft een grote attractie te zijn; onderweg zijn hoort hier bij de keuze.",
        "Kies dit bij redelijk zicht en als je onderweg vaak wilt stoppen.",
        `Als de lucht dichttrekt, wissel naar de slechtweer-optie rond ${referenceBadWeatherTarget.name}.`,
        "Scenic route",
        tripDirection,
        priorityHighlightIds,
      ),
    );
  });

  transitTargets.forEach((target, index) => {
    routeOptionPromises.push(
      buildOption(
        current,
        "doorreis",
        index === 0 ? `Doorreisdag naar ${target.name}` : `Doorreisoptie: ${target.name}`,
        target,
        nearbyFor(target, dayStyle, 1),
        maxDriveHours,
        ev,
        dayStyle,
        "Een praktische dag met een bestemming die de reis open houdt. Er zit nog steeds iets te beleven in, maar de keuze is vooral bedoeld om morgen meer mogelijkheden te hebben.",
        "Kies dit als je voelt dat de route weer wat richting nodig heeft.",
        "Blijf waar je bent of kies de korte dag als de dag al vol genoeg voelt.",
        "Doorreis met stop",
        tripDirection,
        priorityHighlightIds,
      ),
    );
  });

  badWeatherTargets.forEach((target, index) => {
    routeOptionPromises.push(
      buildOption(
        current,
        "slechtweer",
        index === 0 ? `Slechtweer-alternatief: ${target.name}` : `Beschutte optie: ${target.name}`,
        target,
        nearbyFor(target, "slechtweer", 1),
        maxDriveHours,
        ev,
        dayStyle,
        "Een beschutte keuze voor dagen waarop lage wolken, regen of vermoeidheid de bergen minder aantrekkelijk maken. Stad, cultuur en korte stops krijgen dan vanzelf meer waarde.",
        "Kies dit bij regen, harde wind, lage wolken of simpelweg een rustige dag.",
        `Bij opklaringen kun je alsnog een korte viewpoint-stop toevoegen, bijvoorbeeld ${referenceScenicTarget.name}.`,
        "Regenbestendig",
        tripDirection,
        priorityHighlightIds,
      ),
    );
  });

  const options = await Promise.all(routeOptionPromises);
  const viableOptions = options.filter((option) => {
    if (option.kind === "blijven") return true;
    if (!option.stops.every((stop) => isDirectionallyAllowed(current, stop.highlight, tripDirection))) return false;
    const hardLimit =
      option.kind === "doorreis"
        ? Math.min(ABSOLUTE_RECOMMENDATION_LIMIT_HOURS, maxDriveHours + 1.2)
        : Math.min(4.6, maxDriveHours + 0.9);
    return option.estimatedDriveHours <= hardLimit;
  });

  const deduped: RouteOption[] = [];
  const seenIds = new Set<string>();
  const seenPrimaryTargets = new Set<string>();
  const seenStopSets = new Set<string>();

  const addIfUnique = (option: RouteOption) => {
    if (seenIds.has(option.id)) return;

    const stopSet = option.stops.map((stop) => stop.highlight.id).sort().join("|");

    if (option.kind === "blijven") {
      if (seenStopSets.has(stopSet)) return;
      seenIds.add(option.id);
      seenStopSets.add(stopSet);
      deduped.push(option);
      return;
    }

    const primaryTarget = option.stops[0]?.highlight.id;
    if (!primaryTarget || seenPrimaryTargets.has(primaryTarget) || seenStopSets.has(stopSet)) return;

    seenIds.add(option.id);
    seenPrimaryTargets.add(primaryTarget);
    seenStopSets.add(stopSet);
    deduped.push(option);
  };

  viableOptions.sort((a, b) => b.score - a.score).forEach(addIfUnique);

  return deduped.slice(0, MAX_ROUTE_OPTIONS);
}
