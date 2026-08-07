import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from 'react';

import erangelMap from '../../assets/Pubg/map_images/compressed/Erangel_High_Res.png';
import miramarMap from '../../assets/Pubg/map_images/compressed/Miramar_High_Res.png';
import sanhokMap from '../../assets/Pubg/map_images/compressed/Sanhok_High_Res.png';
import vikendiMap from '../../assets/Pubg/map_images/compressed/Vikendi_High_Res.png';
import taegoMap from '../../assets/Pubg/map_images/compressed/Taego_High_Res.png';
import paramoMap from '../../assets/Pubg/map_images/compressed/Paramo_High_Res.png';
import havenMap from '../../assets/Pubg/map_images/compressed/Haven_High_Res.png';
import destonMap from '../../assets/Pubg/map_images/compressed/Deston_High_Res.png';
import rondoMap from '../../assets/Pubg/map_images/compressed/Rondo_High_Res.png';
import campJackalMap from '../../assets/Pubg/map_images/compressed/Camp_Jackal_High_Res.png';
import { formatDuration, lerp } from '../../utils/replayMath';

const mapImages: { [key: string]: string } = {
  Erangel: erangelMap,
  Miramar: miramarMap,
  Sanhok: sanhokMap,
  Vikendi: vikendiMap,
  Taego: taegoMap,
  Paramo: paramoMap,
  Haven: havenMap,
  Deston: destonMap,
  Rondo: rondoMap,
  'Camp Jackal': campJackalMap,
  Baltic_Main: erangelMap,
  Erangel_Main: erangelMap,
  Desert_Main: miramarMap,
  Savage_Main: sanhokMap,
  DihorOtok_Main: vikendiMap,
  Tiger_Main: taegoMap,
  Chimera_Main: paramoMap,
  Heaven_Main: havenMap,
  Kiki_Main: destonMap,
  Neon_Main: rondoMap,
  Range_Main: campJackalMap,
};

const resolveMapImage = (mapName: string): string => {
  if (mapImages[mapName]) return mapImages[mapName];
  const normalized = mapName.trim();
  const hit = Object.keys(mapImages).find(
    (key) => key.toLowerCase() === normalized.toLowerCase()
  );
  return hit ? mapImages[hit] : erangelMap;
};

export interface TrackKeyframe {
  t: number;
  x: number;
  y: number;
  z: number;
  team_id?: number | null;
  is_dead?: boolean;
}

export interface FramePlayer {
  name: string;
  x: number;
  y: number;
  z: number;
  team_id?: number | null;
  is_dead?: boolean;
}

interface TelemetryOverlayProps {
  tracks: Record<string, TrackKeyframe[]>;
  elapsedTime: number;
  playerName: string;
  mapName: string;
}

const BASE_DOT_R = 4;
const BASE_STROKE = 1.5;
const BASE_X = 3;

const PlayIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const StopIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
    />
  </svg>
);

const SpeedUpIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

const SpeedDownIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 14V3L2 14h9v7l9-11h-9z"
    />
  </svg>
);

const TEAM_COLORS = [
  'rgba(255, 0, 0, 0.85)',
  'rgba(0, 220, 0, 0.85)',
  'rgba(40, 120, 255, 0.85)',
  'rgba(255, 220, 0, 0.85)',
  'rgba(255, 0, 220, 0.85)',
  'rgba(0, 220, 220, 0.85)',
  'rgba(255, 140, 0, 0.85)',
  'rgba(160, 80, 255, 0.85)',
  'rgba(0, 180, 255, 0.85)',
  'rgba(255, 80, 140, 0.85)',
  'rgba(140, 255, 0, 0.85)',
  'rgba(0, 255, 160, 0.85)',
];

const getTeamColor = (teamId: number | null | undefined, isMainPlayer: boolean): string => {
  if (isMainPlayer) return 'rgba(255, 40, 40, 0.95)';
  if (teamId === undefined || teamId === null) return 'rgba(160, 160, 160, 0.85)';
  return TEAM_COLORS[teamId % TEAM_COLORS.length];
};

const bisectRight = (times: number[], target: number): number => {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const playersAtTime = (
  tracks: Record<string, TrackKeyframe[]>,
  timeIndex: Record<string, number[]>,
  t: number
): FramePlayer[] => {
  const out: FramePlayer[] = [];
  for (const name of Object.keys(tracks)) {
    const frames = tracks[name];
    const times = timeIndex[name];
    if (!frames.length || t < times[0]) continue;

    let x: number;
    let y: number;
    let z: number;
    let team_id: number | null | undefined;
    let is_dead: boolean;

    if (t >= times[times.length - 1]) {
      const f = frames[frames.length - 1];
      x = f.x;
      y = f.y;
      z = f.z;
      team_id = f.team_id;
      is_dead = !!f.is_dead;
    } else {
      const idx = bisectRight(times, t);
      const prev = frames[idx - 1];
      const next = frames[idx];
      const span = next.t - prev.t;
      const u = span <= 0 ? 0 : (t - prev.t) / span;
      x = lerp(prev.x, next.x, u);
      y = lerp(prev.y, next.y, u);
      z = lerp(prev.z, next.z, u);
      team_id = prev.team_id;
      is_dead = !!(prev.is_dead || next.is_dead);
    }

    out.push({ name, x, y, z, team_id, is_dead });
  }
  return out;
};

/** Project map coords (0–1000) into stage pixels with the same pan/zoom as the map image. */
const mapToScreen = (
  mapX: number,
  mapY: number,
  stageSize: number,
  zoom: number,
  panX: number,
  panY: number
) => {
  const cx = stageSize / 2;
  const cy = stageSize / 2;
  const lx = (mapX / 1000) * stageSize;
  const ly = (mapY / 1000) * stageSize;
  return {
    x: cx + (lx - cx) * zoom + panX,
    y: cy + (ly - cy) * zoom + panY,
  };
};

const TelemetryOverlay: React.FC<TelemetryOverlayProps> = ({
  tracks,
  elapsedTime,
  playerName,
  mapName,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [stageSize, setStageSize] = useState(720);
  const [isDragging, setIsDragging] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lastMousePos = useRef({ x: 0, y: 0 });
  const viewRaf = useRef(0);
  const playRaf = useRef(0);
  const playStartWall = useRef(0);
  const playStartTime = useRef(0);
  const speedRef = useRef(1);
  const elapsedRef = useRef(elapsedTime);
  const currentTimeRef = useRef(0);

  speedRef.current = playbackSpeed;
  elapsedRef.current = elapsedTime;
  currentTimeRef.current = currentTime;

  const timeIndex = useMemo(() => {
    const idx: Record<string, number[]> = {};
    for (const name of Object.keys(tracks)) {
      idx[name] = tracks[name].map((f) => f.t);
    }
    return idx;
  }, [tracks]);

  const players = useMemo(
    () => playersAtTime(tracks, timeIndex, currentTime),
    [tracks, timeIndex, currentTime]
  );

  const mainPlayerTeamId = useMemo(() => {
    const main = players.find((p) => p.name === playerName);
    return main?.team_id;
  }, [players, playerName]);

  // Screen-space dots (SVG is NOT CSS-scaled → stay sharp). Shrink with zoom for precision.
  // Floor at 4px radius so fully-zoomed dots stay readable (~2× prior minimum).
  const dotR = Math.max(4, BASE_DOT_R / Math.sqrt(view.zoom));
  const strokeW = Math.max(1.25, BASE_STROKE / Math.sqrt(view.zoom));
  const xLen = Math.max(3, BASE_X / Math.sqrt(view.zoom));

  const applyMapTransform = useCallback(() => {
    if (!mapStageRef.current) return;
    const { x, y } = positionRef.current;
    const z = zoomRef.current;
    mapStageRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }, []);

  const flushView = useCallback(
    (syncReact: boolean) => {
      applyMapTransform();
      if (!syncReact) return;
      if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
      viewRaf.current = requestAnimationFrame(() => {
        viewRaf.current = 0;
        setView({
          zoom: zoomRef.current,
          x: positionRef.current.x,
          y: positionRef.current.y,
        });
      });
    },
    [applyMapTransform]
  );

  useEffect(() => {
    const measure = () => {
      if (!viewportRef.current) return;
      const w = viewportRef.current.clientWidth;
      if (w > 0) setStageSize(w);
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Non-passive wheel so preventDefault actually blocks page scroll
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const size = viewportRef.current?.clientWidth || Math.min(rect.width, rect.height, 720);
      const containerCenterX = rect.width / 2;
      const containerCenterY = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const prevZoom = zoomRef.current;
      const newZoom = Math.min(Math.max(prevZoom * delta, 1), 6);
      const zoomRatio = newZoom / prevZoom;

      const pointX = mouseX - containerCenterX;
      const pointY = mouseY - containerCenterY;
      let newX = positionRef.current.x - pointX * (zoomRatio - 1);
      let newY = positionRef.current.y - pointY * (zoomRatio - 1);
      const maxOffset = ((newZoom - 1) * size) / 2;
      newX = Math.min(Math.max(newX, -maxOffset), maxOffset);
      newY = Math.min(Math.max(newY, -maxOffset), maxOffset);

      zoomRef.current = newZoom;
      positionRef.current = { x: newX, y: newY };
      flushView(true);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [flushView]);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (playRaf.current) cancelAnimationFrame(playRaf.current);
      playRaf.current = 0;
      return;
    }

    playStartWall.current = performance.now();
    playStartTime.current = currentTimeRef.current;

    const tick = (now: number) => {
      const elapsedReal = (now - playStartWall.current) / 1000;
      const next = playStartTime.current + elapsedReal * speedRef.current;
      if (next >= elapsedRef.current) {
        setCurrentTime(elapsedRef.current);
        setIsPlaying(false);
        return;
      }
      setCurrentTime(next);
      playRaf.current = requestAnimationFrame(tick);
    };

    playRaf.current = requestAnimationFrame(tick);
    return () => {
      if (playRaf.current) cancelAnimationFrame(playRaf.current);
      playRaf.current = 0;
    };
  }, [isPlaying, playbackSpeed]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomRef.current > 1.05) {
      e.preventDefault();
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || zoomRef.current <= 1.05) return;
    e.preventDefault();
    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;
    const size = viewportRef.current?.clientWidth || 720;
    const maxOffset = ((zoomRef.current - 1) * size) / 2;
    positionRef.current = {
      x: Math.min(Math.max(positionRef.current.x + deltaX, -maxOffset), maxOffset),
      y: Math.min(Math.max(positionRef.current.y + deltaY, -maxOffset), maxOffset),
    };
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    flushView(true);
  };

  const handlePlayPause = () => setIsPlaying((p) => !p);
  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };
  const handleSpeedUp = () => {
    const speeds = [0.5, 1, 2, 4, 8, 16, 32];
    const i = speeds.indexOf(playbackSpeed);
    if (i < speeds.length - 1) setPlaybackSpeed(speeds[i + 1]);
  };
  const handleSpeedDown = () => {
    const speeds = [0.5, 1, 2, 4, 8, 16, 32];
    const i = speeds.indexOf(playbackSpeed);
    if (i > 0) setPlaybackSpeed(speeds[i - 1]);
  };

  const mapSrc = useMemo(() => resolveMapImage(mapName), [mapName]);

  const screenPlayers = useMemo(
    () =>
      players.map((p) => {
        const s = mapToScreen(p.x, p.y, stageSize, view.zoom, view.x, view.y);
        return { ...p, sx: s.x, sy: s.y };
      }),
    [players, stageSize, view]
  );

  return (
    <div className="relative">
      <div className="flex w-full flex-wrap items-center gap-2 border-b border-tact-rim bg-tact-ink px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={handlePlayPause}
          className="border border-tact-rim bg-tact-steel p-2 text-tact-gold hover:border-tact-gold/50"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="border border-tact-rim bg-tact-steel p-2 text-tact-sand hover:border-tact-gold/40"
          aria-label="Stop"
        >
          <StopIcon />
        </button>
        <button
          type="button"
          onClick={handleSpeedDown}
          className="border border-tact-rim bg-tact-steel p-2 text-tact-sand hover:border-tact-gold/40"
          aria-label="Slower"
        >
          <SpeedDownIcon />
        </button>
        <span className="min-w-[2.5rem] text-center font-mono text-sm text-tact-flare">
          {playbackSpeed}x
        </span>
        <button
          type="button"
          onClick={handleSpeedUp}
          className="border border-tact-rim bg-tact-steel p-2 text-tact-sand hover:border-tact-gold/40"
          aria-label="Faster"
        >
          <SpeedUpIcon />
        </button>
        <div className="mx-1 min-w-[140px] flex-1 sm:mx-3">
          <input
            type="range"
            min="0"
            max={elapsedTime || 1}
            step="0.05"
            value={currentTime}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentTime(Number(e.target.value));
            }}
            className="tact-slider w-full"
          />
        </div>
        <span className="font-mono text-xs tracking-wider text-tact-mute sm:text-sm">
          {formatDuration(currentTime)} / {formatDuration(elapsedTime)}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-tact-mute sm:inline">
          {view.zoom.toFixed(1)}x zoom
        </span>
      </div>

      <div
        ref={mapContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        className={`relative overflow-hidden ${
          isDragging ? 'cursor-grabbing' : view.zoom > 1.05 ? 'cursor-grab' : 'cursor-zoom-in'
        }`}
        style={{
          height: 'min(70vh, 720px)',
          width: '100%',
          backgroundColor: '#0a0c0a',
          overscrollBehavior: 'contain',
          touchAction: 'none',
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={viewportRef}
            className="relative overflow-hidden"
            style={{
              width: 'min(100%, 720px)',
              aspectRatio: '1 / 1',
            }}
          >
            {/* Map image only — CSS zoom/pan */}
            <div
              ref={mapStageRef}
              className="absolute inset-0 origin-center"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                willChange: 'transform',
              }}
            >
              <img
                src={mapSrc}
                alt={`${mapName} Map`}
                draggable={false}
                decoding="async"
                className="absolute inset-0 h-full w-full select-none object-contain pointer-events-none"
              />
            </div>

            {/* Dots in screen space — never CSS-scaled, so they stay crisp */}
            <svg
              className="absolute inset-0 h-full w-full pointer-events-none"
              width={stageSize}
              height={stageSize}
              viewBox={`0 0 ${stageSize} ${stageSize}`}
            >
              {screenPlayers.map((player) => {
                const isMain = player.name === playerName;
                const r = isMain ? dotR * 1.15 : dotR;
                return (
                  <g key={player.name}>
                    <circle
                      cx={player.sx}
                      cy={player.sy}
                      r={r}
                      fill={getTeamColor(player.team_id, isMain)}
                      stroke={
                        player.team_id === mainPlayerTeamId
                          ? 'rgba(255, 60, 60, 0.95)'
                          : 'rgba(255,255,255,0.9)'
                      }
                      strokeWidth={strokeW}
                      opacity={player.is_dead ? 0.45 : 1}
                    />
                    {player.is_dead && (
                      <g stroke="white" strokeWidth={strokeW} opacity={0.85}>
                        <line
                          x1={player.sx - xLen}
                          y1={player.sy - xLen}
                          x2={player.sx + xLen}
                          y2={player.sy + xLen}
                        />
                        <line
                          x1={player.sx + xLen}
                          y1={player.sy - xLen}
                          x2={player.sx - xLen}
                          y2={player.sy + xLen}
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(TelemetryOverlay);
