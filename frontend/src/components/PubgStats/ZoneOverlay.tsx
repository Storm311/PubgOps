import React from 'react';
import { ZoneCircle, ZoneState } from '../../utils/zoneMath';

type Project = (mapX: number, mapY: number) => { x: number; y: number };

interface ZoneLayerProps {
  state: ZoneState;
  project: Project;
  /** Screen pixels per map unit (0–1000 space) at the current zoom. */
  unit: number;
  size: number;
}

const circlePath = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const toScreen = (c: ZoneCircle, project: Project, unit: number) => {
  const p = project(c.x, c.y);
  return { cx: p.x, cy: p.y, r: c.r * unit };
};

/** SVG layer: blue zone (tinted outside the safe area), white circle, red zones. */
export const ZoneLayer: React.FC<ZoneLayerProps> = ({ state, project, unit, size }) => {
  const blue = toScreen(state.blue, project, unit);
  const white = state.white ? toScreen(state.white, project, unit) : null;

  return (
    <g>
      {state.redZones.map((z, i) => {
        const red = toScreen(z, project, unit);
        return (
          <circle
            key={i}
            cx={red.cx}
            cy={red.cy}
            r={red.r}
            fill="rgba(194, 59, 42, 0.22)"
            stroke="rgba(230, 70, 50, 0.9)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        );
      })}
      <path
        d={`M0 0H${size}V${size}H0Z${circlePath(blue.cx, blue.cy, blue.r)}`}
        fillRule="evenodd"
        fill="rgba(48, 102, 255, 0.24)"
      />
      <circle
        cx={blue.cx}
        cy={blue.cy}
        r={blue.r}
        fill="none"
        stroke="rgba(110, 160, 255, 0.95)"
        strokeWidth={2}
      />
      {white && (
        <circle
          cx={white.cx}
          cy={white.cy}
          r={white.r}
          fill="none"
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth={1.5}
        />
      )}
    </g>
  );
};
