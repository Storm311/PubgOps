import React, { createContext, useContext, useState, ReactNode } from 'react';

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

export const PubgStatsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [playerName, setPlayerName] = useState('');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [matches, setMatches] = useState<MatchDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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