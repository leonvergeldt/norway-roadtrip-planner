import {
  Award,
  BatteryCharging,
  Compass,
  Flag,
  Home,
  Leaf,
  Map,
  Route,
  Star,
} from "lucide-react";
import { HighlightImage } from "./HighlightImage";
import type { Highlight, RecommendationRole, RouteOption } from "../types";

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

function recommendationMeta(role: RecommendationRole) {
  if (role === "best") return { label: "Beste keuze", Icon: Award };
  if (role === "calm") return { label: "Rustiger", Icon: Leaf };
  if (role === "progress") return { label: "Verder reizen", Icon: Route };
  return { label: "Anders van karakter", Icon: Compass };
}

export function RouteOptionCard({
  option,
  isSelected,
  priorityHighlightIdSet,
  completedHighlightIdSet,
  onSelect,
  onOpenHighlight,
}: RouteOptionCardProps) {
  const role = option.recommendationRole ?? "alternative";
  const { label: roleLabel, Icon: RoleIcon } = recommendationMeta(role);
  const activityHours = option.stops.reduce((total, stop) => total + stop.highlight.visitTimeHours, 0);

  return (
    <article className={`route-card recommendation-${role} ${isSelected ? "selected" : ""}`}>
      <header className="route-card-top">
        <span className={`recommendation-chip ${role}`}>
          <RoleIcon size={15} />
          {roleLabel}
        </span>
        <span className={option.fitsDriveWindow ? "fit good" : "fit warn"}>
          {option.fitsDriveWindow ? "Past vandaag" : "Ambitieus"}
        </span>
      </header>

      <div className="route-card-copy">
        <h3>{option.title}</h3>
        <p className="route-guide">{option.guideText}</p>
      </div>

      <dl className="stats">
        <div>
          <dt>Rijtijd</dt>
          <dd>{formatHours(option.estimatedDriveHours)}</dd>
        </div>
        <div>
          <dt>Afstand</dt>
          <dd>{option.estimatedDistanceKm} km</dd>
        </div>
        <div>
          <dt>Activiteit</dt>
          <dd>{formatHours(activityHours)}</dd>
        </div>
      </dl>

      <div className="stops" aria-label="Belangrijkste stops">
        {option.stops.slice(0, 3).map((stop) => (
          <button
            key={stop.highlight.id}
            type="button"
            onClick={() => onOpenHighlight(stop.highlight)}
          >
            <span className="stop-main">
              <strong>{stop.highlight.name}</strong>
              {priorityHighlightIdSet.has(stop.highlight.id) && !completedHighlightIdSet.has(stop.highlight.id) && (
                <em>
                  <Star size={13} />
                  Zeker doen
                </em>
              )}
            </span>
            <span>{stop.distanceFromStartKm} km</span>
          </button>
        ))}
      </div>

      {!!option.offlineLabels.length && (
        <div className="route-labels" aria-label="Route-indicaties">
          {option.offlineLabels.slice(0, 3).map((label) => (
            <span key={label.label} className={`route-label ${label.tone}`} title={label.description}>
              {label.label}
            </span>
          ))}
        </div>
      )}

      <div className={`ev-message ${option.evLevel}`}>
        <BatteryCharging size={16} />
        {option.evMessage}
      </div>

      <button
        className="route-map-button"
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(option.id)}
      >
        <Map size={16} />
        {isSelected ? "Route staat op kaart" : "Bekijk op kaart"}
      </button>

      <details className="route-details">
        <summary>
          <span>Waarom deze keuze?</span>
          <em>Details</em>
        </summary>
        <div className="route-detail-content">
          <p className="role-reason">{option.recommendationReason ?? option.rankingReason}</p>
          <p className="exact-score">
            Score {option.score}/100 op basis van rijtijd, spreiding, must-see waarde, EV-risico en reisritme.
          </p>
          <p>{option.rankingReason}</p>

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

          <div className="route-detail-section">
            <strong>Routeberekening</strong>
            <p className="route-source">
              {option.routeSource === "osrm"
                ? "Afstand en rijtijd via online routeberekening over OpenStreetMap-wegen."
                : "Afstand en rijtijd via fallbackschatting; geen wegennet gebruikt."}
            </p>
            {option.stops.some((stop) => hasNavigationTarget(stop.highlight)) && (
              <p className="route-source">
                De routelijn stopt bij praktische parkeer- of aankomstpunten, niet altijd bij de landmark-marker.
              </p>
            )}
          </div>

          {!!option.offlineLabels.length && (
            <div className="offline-label-panel route-detail-section">
              <strong>Route-indicaties</strong>
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

          {option.suggestedSleepBase && (
            <div className="sleepbase-suggestion">
              <Home size={16} />
              <div>
                <strong>Logische slaapbasis: {option.suggestedSleepBase.name}</strong>
                <p>
                  {option.suggestedSleepBase.region} - ongeveer {option.suggestedSleepBase.distanceKm} km vanaf de
                  laatste stop. {option.suggestedSleepBase.reason}
                </p>
              </div>
            </div>
          )}

          <div className="stop-context-list route-detail-section">
            {option.stops.map((stop) => (
              <article key={`context-${stop.highlight.id}`} className="stop-context">
                <HighlightImage highlight={stop.highlight} />
                <div>
                  <strong>{stop.highlight.name}</strong>
                  <p>{stop.highlight.detail?.[0] ?? stop.highlight.description}</p>
                  {hasNavigationTarget(stop.highlight) && (
                    <p className="stop-tip">
                      <Flag size={12} /> Navigeer naar {navigationTargetText(stop.highlight)}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="route-detail-section">
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
          </div>
        </div>
      </details>
    </article>
  );
}
