import {
  BatteryCharging,
  CloudRain,
  Compass,
  Flag,
  Gauge,
  Home,
  MapPinned,
  Mountain,
  Route,
  Star,
} from "lucide-react";
import { HighlightImage } from "./HighlightImage";
import type { Highlight, RouteOption } from "../types";

interface RouteOptionCardProps {
  option: RouteOption;
  isSelected: boolean;
  priorityHighlightIdSet: Set<string>;
  completedHighlightIdSet: Set<string>;
  onSelect: (optionId: string) => void;
  onOpenHighlight: (highlight: Highlight) => void;
}

function hasNavigationTarget(highlight: Highlight) {
  return highlight.navigationLat !== undefined && highlight.navigationLng !== undefined;
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
  return <MapPinned size={16} />;
}

function scoreLabel(score: number) {
  if (score >= 75) return "Topmatch";
  if (score >= 65) return "Sterke match";
  if (score >= 55) return "Logische optie";
  return "Alleen als het past";
}

export function RouteOptionCard({
  option,
  isSelected,
  priorityHighlightIdSet,
  completedHighlightIdSet,
  onSelect,
  onOpenHighlight,
}: RouteOptionCardProps) {
  return (
    <article className={`route-card ${isSelected ? "selected" : ""}`} onClick={() => onSelect(option.id)}>
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
          {option.offlineLabels.length > 3 && (
            <span className="route-label neutral">+{option.offlineLabels.length - 3}</span>
          )}
        </div>
      )}
      {option.stops[0]?.highlight && (
        <div className="route-visual">
          <HighlightImage highlight={option.stops[0].highlight} />
          <div>
            <strong>{option.stops[0].highlight.name}</strong>
            <p>{option.stops[0].highlight.detail?.[0] ?? option.stops[0].highlight.description}</p>
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
            De zwarte routelijn stopt bij praktische navigatiepunten. De gekleurde landmark-marker kan dus iets verderop liggen.
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
          <span>
            Rijtijd <strong>{option.scoreBreakdown.driveTime}</strong>
          </span>
          <span>
            Spreiding <strong>{option.scoreBreakdown.activitySpread}</strong>
          </span>
          <span>
            Must-see <strong>{option.scoreBreakdown.mustSee}</strong>
          </span>
          <span>
            EV-risico <strong>{option.scoreBreakdown.evRisk}</strong>
          </span>
          <span>
            Ritme <strong>{option.scoreBreakdown.rhythm}</strong>
          </span>
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
      {option.suggestedSleepBase && (
        <div className="sleepbase-suggestion">
          <Home size={16} />
          <div>
            <strong>Logische slaapbasis: {option.suggestedSleepBase.name}</strong>
            <p>
              {option.suggestedSleepBase.region} - ongeveer {option.suggestedSleepBase.distanceKm} km vanaf de laatste
              stop. {option.suggestedSleepBase.reason}
            </p>
          </div>
        </div>
      )}
      <div className="stops">
        {option.stops.slice(0, 3).map((stop) => (
          <button
            key={stop.highlight.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenHighlight(stop.highlight);
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
        {option.stops.length > 3 && <div className="more-stops-note">+{option.stops.length - 3} extra stop in details</div>}
      </div>
      <details className="more-info">
        <summary>Waarom deze stops?</summary>
        <div className="stop-context-list">
          {option.stops.map((stop) => (
            <article key={`context-${stop.highlight.id}`} className="stop-context">
              <HighlightImage highlight={stop.highlight} />
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
        <p className="microcopy">
          <strong>Wel kiezen:</strong> {option.whenToChoose}
        </p>
        <p className="microcopy">
          <strong>Alternatief:</strong> {option.alternative}
        </p>
        {!!option.warnings.length && (
          <ul className="warnings">
            {option.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
