import React, { memo } from 'react';

const HUD_BOX = 'pointer-events-none absolute border border-tact-rim bg-tact-ink/85 px-3 py-1.5';

/** Bottom-right: current zone phase (or pre-zone before the first circle). */
export const PhaseBadge: React.FC<{ phase: number; shrinking: boolean }> = memo(
  ({ phase, shrinking }) => (
    <div className={`${HUD_BOX} bottom-2 right-2 text-right`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">
        {shrinking ? 'Zone closing' : 'Zone'}
      </div>
      <div
        className={`font-display text-2xl leading-none tracking-[0.08em] ${
          shrinking ? 'text-sky-300' : 'text-tact-fog'
        }`}
      >
        {phase > 0 ? `Phase ${phase}` : 'Pre-zone'}
      </div>
    </div>
  )
);

/** Top-right: players still alive (down on deaths, up on respawns). */
export const AliveCounter: React.FC<{ alive: number }> = memo(({ alive }) => (
  <div className={`${HUD_BOX} right-2 top-2 flex items-baseline gap-2`}>
    <span className="font-display text-2xl leading-none text-tact-flare">{alive}</span>
    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">Alive</span>
  </div>
));
