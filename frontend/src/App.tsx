import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PubgStats from './components/PubgStats/PubgStats';
import MatchDetails from './components/PubgStats/MatchDetails';
import { PubgStatsProvider } from './components/PubgStats/PubgStatsContext';

const App: React.FC = () => {
  return (
    <Router>
      <PubgStatsProvider>
        <div className="relative min-h-screen overflow-x-hidden bg-tact-void text-tact-fog">
          <div className="pointer-events-none fixed inset-0 bg-tact-wash" aria-hidden />
          <div
            className="pointer-events-none fixed inset-0 bg-tact-grid bg-grid opacity-40"
            aria-hidden
          />

          <header className="relative z-20 border-b border-tact-rim/80 bg-tact-ink">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <Link to="/" className="group flex items-baseline gap-3 no-underline">
                <span className="font-display text-3xl tracking-[0.08em] text-tact-flare transition-colors group-hover:text-tact-gold sm:text-4xl">
                  PubgOps
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-tact-mute">
                  Battleground // Intel
                </span>
              </Link>
              <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute sm:flex">
                <span className="h-1.5 w-1.5 bg-tact-signal animate-pulse" />
                Live feed
              </div>
            </div>
          </header>

          <main className="relative z-10">
            <Routes>
              <Route path="/" element={<PubgStats />} />
              <Route
                path="/player/:playerName/match/:matchId"
                element={<MatchDetails />}
              />
            </Routes>
          </main>
        </div>
      </PubgStatsProvider>
    </Router>
  );
};

export default App;
