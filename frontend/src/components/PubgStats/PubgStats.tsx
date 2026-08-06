import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { usePubgStats } from './PubgStatsContext';

import matchesIcon from '../../assets/Pubg/icons/matches.png';
import killsIcon from '../../assets/Pubg/icons/ak.png';
import damageIcon from '../../assets/Pubg/icons/crosshair.png';
import skullIcon from '../../assets/Pubg/icons/skull.png';

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const TEAM_DOTS = [
  'bg-tact-flare',
  'bg-orange-400',
  'bg-sky-400',
  'bg-tact-signal',
  'bg-amber-600',
  'bg-rose-400',
  'bg-tact-blood',
  'bg-teal-400',
];

interface PlayerStats {
  player_name: string;
  platform: string;
  stats: {
    total_matches: number;
    total_kills: number;
    total_damage: number;
    total_distance: number;
    most_kills: number;
  };
}

interface MatchDetails {
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
  Telemetry_Link: string;
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const pubgApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: 'application/json',
  },
});

const apiErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (err.response?.status === 404) return 'Player not found on any platform';
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'An error occurred';
};

const getPlayerStats = async (playerName: string): Promise<PlayerStats> => {
  const response = await pubgApi.get(`/player/${playerName}`);
  return response.data;
};

const getPlayerMatches = async (playerName: string): Promise<MatchDetails[]> => {
  const response = await pubgApi.get(`/player/${playerName}/matches`);
  return response.data.map((match: MatchDetails) => ({
    match_id: match.match_id,
    Map: match.Map,
    'Game Mode': match['Game Mode'],
    'Match Type': match['Match Type'],
    Duration: match.Duration,
    Kills: match.Kills,
    Damage: match.Damage,
    Assists: match.Assists,
    'Win Place': match['Win Place'],
    Headshots: match.Headshots,
    DBNOs: match.DBNOs,
    Revives: match.Revives,
    Boosts: match.Boosts,
    Heals: match.Heals,
    'Longest Kill': match['Longest Kill'],
    Teammates: match.Teammates,
    Telemetry_Link: match.Telemetry_Link,
  }));
};

const placeClass = (place: number) => {
  if (place === 1) return 'place-badge place-chicken';
  if (place <= 10) return 'place-badge place-top10';
  return 'place-badge place-default';
};

interface PubgStatsProps {
  className?: string;
  onError?: (error: Error) => void;
}

const PubgStats: React.FC<PubgStatsProps> = ({ className, onError }) => {
  const navigate = useNavigate();
  const {
    playerName,
    setPlayerName,
    stats,
    setStats,
    matches,
    setMatches,
    loading,
    setLoading,
    error,
    setError,
  } = usePubgStats();

  const [toast, setToast] = React.useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const [statsData, matchesData] = await Promise.all([
        getPlayerStats(playerName),
        getPlayerMatches(playerName),
      ]);
      setStats(statsData);
      setMatches(matchesData);
      setPlayerName(playerName.trim());
      setToast({ message: `Intel locked for ${playerName.trim()}`, visible: true });
      setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
    } catch (err) {
      const errorMessage = apiErrorMessage(err);
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (matchId: string) => {
    navigate(`/player/${playerName}/match/${matchId}`);
  };

  const showHero = !stats;

  return (
    <div className={`pubgops ${className || ''}`}>
      {showHero ? (
        <section className="relative mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
          <div className="animate-fade-up">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.4em] text-tact-gold">
              Battlegrounds // After-action
            </p>
            <h1 className="font-display text-[clamp(4rem,14vw,8.5rem)] leading-[0.85] tracking-[0.04em] text-tact-flare">
              Pubg
              <span className="block text-tact-sand/90">Ops</span>
            </h1>
            <p className="mt-6 max-w-md font-hud text-lg text-tact-mute sm:text-xl">
              Pull player kill feeds, placements, and match telemetry from the drop.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-10 max-w-xl animate-fade-up"
            style={{ animationDelay: '120ms' }}
          >
            <label className="stat-label mb-2 block">Operator callsign</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. TGLTN"
                className="clip-panel flex-1 border border-tact-rim bg-tact-steel/80 px-4 py-3.5 font-hud text-lg text-tact-fog placeholder:text-tact-mute/60 outline-none transition focus:border-tact-gold/60 focus:shadow-glow"
              />
              <button
                type="submit"
                disabled={loading}
                className="clip-btn bg-tact-gold px-8 py-3.5 font-display text-2xl tracking-[0.12em] text-tact-void hover:bg-tact-flare disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'SCANNING…' : 'DEPLOY'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-6 max-w-xl border border-tact-blood/50 bg-tact-blood/15 px-4 py-3 font-mono text-sm text-red-200">
              {error}
            </div>
          )}
        </section>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Search another player…"
                className="clip-panel flex-1 border border-tact-rim bg-tact-steel/70 px-4 py-3 font-hud text-base text-tact-fog placeholder:text-tact-mute/60 outline-none transition focus:border-tact-gold/50"
              />
              <div className="relative">
                <button
                  type="submit"
                  disabled={loading}
                  className="clip-btn w-full bg-tact-gold px-6 py-3 font-display text-xl tracking-[0.1em] text-tact-void transition hover:bg-tact-flare disabled:opacity-50 sm:w-auto"
                >
                  {loading ? 'SCANNING…' : 'RELOAD'}
                </button>
                {toast.visible && (
                  <div className="absolute right-0 top-full z-30 mt-2 whitespace-nowrap border border-tact-signal/40 bg-tact-moss px-3 py-2 font-mono text-xs text-tact-fog animate-fade-up sm:left-full sm:right-auto sm:top-1/2 sm:mt-0 sm:translate-y-[-50%] sm:ml-3">
                    {toast.message}
                  </div>
                )}
              </div>
            </div>
          </form>

          {error && (
            <div className="mb-6 border border-tact-blood/50 bg-tact-blood/15 px-4 py-3 font-mono text-sm text-red-200">
              {error}
            </div>
          )}

          {stats && (
            <div className="space-y-8 animate-fade-up">
              <section className="panel clip-panel p-6 sm:p-8">
                <div className="relative z-10 mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-tact-rim pb-6">
                  <div>
                    <p className="stat-label mb-1">Survivors dossier</p>
                    <h2 className="font-display text-5xl tracking-wide text-tact-flare sm:text-6xl">
                      {stats.player_name}
                    </h2>
                  </div>
                  <span className="border border-tact-rim bg-tact-steel px-3 py-1 font-mono text-xs uppercase tracking-[0.25em] text-tact-sand">
                    {stats.platform}
                  </span>
                </div>

                <div className="relative z-10 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                  {[
                    {
                      label: 'Matches',
                      value: stats.stats.total_matches,
                      icon: matchesIcon,
                    },
                    {
                      label: 'Kills',
                      value: stats.stats.total_kills,
                      icon: killsIcon,
                    },
                    {
                      label: 'Damage',
                      value: Math.round(stats.stats.total_damage),
                      icon: damageIcon,
                    },
                    {
                      label: 'Most kills',
                      value: stats.stats.most_kills,
                      icon: skullIcon,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 border border-tact-rim/80 bg-tact-ink/60 px-4 py-4"
                    >
                      <div>
                        <p className="stat-label">{item.label}</p>
                        <p className="stat-value mt-1">{item.value}</p>
                      </div>
                      <img
                        src={item.icon}
                        alt=""
                        className="h-9 w-9 opacity-80 brightness-110 contrast-125"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-3xl tracking-[0.08em] text-tact-sand">
                    Recent engagements
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">
                    {matches.length} reports
                  </span>
                </div>

                <div className="space-y-3">
                  {matches.map((match) => (
                    <button
                      type="button"
                      key={match.match_id}
                      onClick={() => handleMatchClick(match.match_id)}
                      className="panel clip-panel group w-full p-0 text-left hover:border-tact-gold/35"
                    >
                      <div className="relative z-10 flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:p-5">
                        <div className="flex shrink-0 flex-col items-center justify-center border border-tact-rim bg-tact-ink px-4 py-3 sm:min-w-[5.5rem]">
                          <span className="stat-label mb-1">Place</span>
                          <span className={placeClass(match['Win Place'])}>
                            #{match['Win Place']}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-display text-2xl tracking-wide text-tact-flare">
                              {match.Map}
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-tact-mute">
                              {match['Game Mode']} · {match['Match Type']} ·{' '}
                              {formatDuration(match.Duration)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                              <p className="stat-label">Kills</p>
                              <p className="font-hud text-xl font-semibold text-tact-fog">
                                {match.Kills}
                              </p>
                            </div>
                            <div>
                              <p className="stat-label">Damage</p>
                              <p className="font-hud text-xl font-semibold text-tact-fog">
                                {Math.round(match.Damage)}
                              </p>
                            </div>
                            <div>
                              <p className="stat-label">Assists</p>
                              <p className="font-hud text-xl font-semibold text-tact-fog">
                                {match.Assists}
                              </p>
                            </div>
                            <div>
                              <p className="stat-label">Headshots</p>
                              <p className="font-hud text-xl font-semibold text-tact-fog">
                                {match.Headshots}
                              </p>
                            </div>
                          </div>

                          {match.Teammates && match.Teammates.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-tact-rim/70 pt-3">
                              {match.Teammates.map((teammate, index) => (
                                <span
                                  key={teammate}
                                  className="inline-flex items-center gap-2 border border-tact-rim/60 bg-tact-steel/50 px-2 py-0.5 font-mono text-xs text-tact-sand"
                                >
                                  <span
                                    className={`h-1.5 w-1.5 ${TEAM_DOTS[index % TEAM_DOTS.length]}`}
                                  />
                                  {teammate}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end font-mono text-[10px] uppercase tracking-[0.22em] text-tact-gold opacity-0 transition group-hover:opacity-100 sm:w-24">
                          Open →
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PubgStats;
