import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
  "Game Mode": string;
  "Match Type": string;
  Duration: number;
  Kills: number;
  Damage: number;
  Assists: number;
  "Win Place": number;
  Headshots: number;
  DBNOs: number;
  Revives: number;
  Boosts: number;
  Heals: number;
  "Longest Kill": number;
  Teammates: string[];
  Telemetry_Link?: string;
}

interface PubgStatsContextType {
  playerName: string;
  setPlayerName: (name: string) => void;
  stats: PlayerStats | null;
  setStats: (stats: PlayerStats | null) => void;
  matches: MatchDetails[];
  setMatches: (matches: MatchDetails[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const PubgStatsContext = createContext<PubgStatsContextType | undefined>(undefined);

const STORAGE_KEY = 'pubgops:search';

interface SavedSearch {
  playerName: string;
  stats: PlayerStats | null;
  matches: MatchDetails[];
}

// Per-tab copy of the last search so a refresh on a match page still has its data.
const loadSaved = (): SavedSearch | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch) : null;
  } catch {
    return null;
  }
};

export const PubgStatsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [saved] = useState(loadSaved);
  const [playerName, setPlayerName] = useState(saved?.playerName ?? '');
  const [stats, setStats] = useState<PlayerStats | null>(saved?.stats ?? null);
  const [matches, setMatches] = useState<MatchDetails[]>(saved?.matches ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stats) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ playerName, stats, matches }));
    } catch {
      // Storage full or blocked: refresh just loses the search, as before.
    }
  }, [playerName, stats, matches]);

  return (
    <PubgStatsContext.Provider
      value={{
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
      }}
    >
      {children}
    </PubgStatsContext.Provider>
  );
};

export const usePubgStats = () => {
  const context = useContext(PubgStatsContext);
  if (context === undefined) {
    throw new Error('usePubgStats must be used within a PubgStatsProvider');
  }
  return context;
}; 