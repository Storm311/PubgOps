import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePubgStats } from './PubgStatsContext';
import TelemetryOverlay, { TrackKeyframe } from './TelemetryOverlay';

interface MatchDetailsData {
  match_id: string;
  Map: string;
  'Game Mode': string;
  'Match Type': string;
  Duration: number;
  Kills: number;
  Damage: number;
  Assists: number;
  'Win Place': number;
  Headshots: number;
  DBNOs: number;
  Revives: number;
  Boosts: number;
  Heals: number;
  'Longest Kill': number;
  Teammates: string[];
  Telemetry_Link?: string;
}

interface ReplayData {
  match_id: string;
  status: string;
  message: string;
  elapsed_time: number;
  cache_key: string;
  map_name: string;
  kill_count: number;
  player_count: number;
  tracks: Record<string, TrackKeyframe[]>;
}

interface MatchDetailsProps {
  className?: string;
}

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatDistance = (meters: number | undefined): string => {
  if (meters === undefined || meters === null) return '0.0m';
  return `${meters.toFixed(1)}m`;
};

const TEAM_DOTS = [
  'bg-tact-flare',
  'bg-orange-400',
  'bg-sky-400',
  'bg-tact-signal',
];

const placeClass = (place: number) => {
  if (place === 1) return 'place-badge place-chicken';
  if (place <= 10) return 'place-badge place-top10';
  return 'place-badge place-default';
};

const MatchDetails: React.FC<MatchDetailsProps> = ({ className }) => {
  const { matchId } = useParams<{ matchId: string }>();
  const { matches, playerName } = usePubgStats();
  const navigate = useNavigate();

  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const matchData = matches.find((match) => match.match_id === matchId) as
    | MatchDetailsData
    | undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleLoadTelemetry = async () => {
    if (!matchData?.Telemetry_Link) return;

    setIsLoadingTelemetry(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE}/api/match/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry_url: matchData.Telemetry_Link,
          player_name: playerName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load telemetry data: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as ReplayData;
      if (!data.tracks) {
        throw new Error('Server response missing sparse tracks');
      }
      setReplay(data);
    } catch (error) {
      console.error('Error loading telemetry data:', error);
      setLoadError(error instanceof Error ? error.message : 'Load failed');
    } finally {
      setIsLoadingTelemetry(false);
    }
  };

  if (!matchData) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="border border-tact-blood/50 bg-tact-blood/15 px-4 py-3 font-mono text-sm text-red-200">
          Match not found — return to the player dossier and select an engagement.
        </div>
        <button
          onClick={() => navigate('/')}
          className="mt-6 clip-btn bg-tact-gold px-6 py-2.5 font-display text-xl tracking-wider text-tact-void"
        >
          BACK
        </button>
      </div>
    );
  }

  const combatStats = [
    { label: 'Headshots', value: matchData.Headshots },
    { label: 'Knocked', value: matchData.DBNOs },
    { label: 'Longest kill', value: formatDistance(matchData['Longest Kill']) },
  ];

  const supportStats = [
    { label: 'Revives', value: matchData.Revives },
    { label: 'Boosts', value: matchData.Boosts },
    { label: 'Heals', value: matchData.Heals },
  ];

  return (
    <div className={`match-details ${className || ''}`}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <button
          onClick={() => navigate('/')}
          className="mb-8 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.28em] text-tact-mute hover:text-tact-gold"
        >
          <span aria-hidden>←</span>
          Dossier
        </button>

        <div className="panel clip-panel mb-6 overflow-hidden">
          <div className="relative z-10 border-b border-tact-rim bg-tact-ink/50 px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="stat-label mb-2">After-action report</p>
                <h1 className="font-display text-5xl tracking-wide text-tact-flare sm:text-6xl">
                  {matchData.Map}
                </h1>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.22em] text-tact-mute">
                  {matchData['Game Mode']} · {matchData['Match Type']} ·{' '}
                  {formatDuration(matchData.Duration)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="stat-label">Placement</span>
                <span className={placeClass(matchData['Win Place'])}>
                  #{matchData['Win Place']}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 grid gap-6 p-5 sm:grid-cols-2 sm:p-8">
            <div>
              <h2 className="mb-4 font-display text-2xl tracking-[0.08em] text-tact-sand">
                Combat
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Kills', value: matchData.Kills },
                  { label: 'Damage', value: Math.round(matchData.Damage) },
                  { label: 'Assists', value: matchData.Assists },
                  ...combatStats,
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-tact-rim/80 bg-tact-ink/50 px-3 py-3"
                  >
                    <p className="stat-label">{stat.label}</p>
                    <p className="mt-1 font-hud text-2xl font-semibold text-tact-fog">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 font-display text-2xl tracking-[0.08em] text-tact-sand">
                Support
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {supportStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-tact-rim/80 bg-tact-ink/50 px-3 py-3"
                  >
                    <p className="stat-label">{stat.label}</p>
                    <p className="mt-1 font-hud text-2xl font-semibold text-tact-fog">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {matchData.Teammates && matchData.Teammates.length > 0 && (
                <div className="mt-6">
                  <h2 className="mb-3 font-display text-2xl tracking-[0.08em] text-tact-sand">
                    Squad
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {matchData.Teammates.map((teammate, index) => (
                      <span
                        key={teammate}
                        className="inline-flex items-center gap-2 border border-tact-rim bg-tact-steel/60 px-3 py-1 font-mono text-sm text-tact-sand"
                      >
                        <span
                          className={`h-1.5 w-1.5 ${TEAM_DOTS[index % TEAM_DOTS.length]}`}
                        />
                        {teammate}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="panel clip-panel overflow-hidden">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-tact-rim px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display text-2xl tracking-[0.08em] text-tact-sand">
                Map telemetry — {matchData.Map}
              </h2>
              {replay && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-tact-mute">
                  {replay.player_count} operators · {replay.kill_count} kills · local scrub
                </p>
              )}
            </div>
            {matchData.Telemetry_Link && !replay && (
              <button
                onClick={handleLoadTelemetry}
                disabled={isLoadingTelemetry}
                className="clip-btn bg-tact-gold px-5 py-2 font-display text-lg tracking-wider text-tact-void hover:bg-tact-flare disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingTelemetry ? 'SYNCING…' : 'LOAD REPLAY'}
              </button>
            )}
          </div>

          <div className="relative z-10">
            {loadError && (
              <div className="border-b border-tact-blood/40 bg-tact-blood/15 px-4 py-3 font-mono text-sm text-red-200">
                {loadError}
              </div>
            )}

            {matchData.Telemetry_Link && !replay && (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 bg-tact-ink/40 px-4 py-12 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-tact-mute">
                  Replay packet standing by
                </p>
                <p className="max-w-sm font-hud text-tact-mute">
                  Server parses telemetry once; scrubbing runs locally from sparse keyframes.
                </p>
              </div>
            )}

            {!matchData.Telemetry_Link && (
              <div className="px-4 py-10 text-center font-mono text-xs uppercase tracking-[0.22em] text-tact-mute">
                No telemetry link for this match
              </div>
            )}

            {replay && (
              <TelemetryOverlay
                tracks={replay.tracks}
                elapsedTime={replay.elapsed_time}
                playerName={playerName}
                mapName={matchData.Map}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default MatchDetails;
