import React, { useState } from 'react';
import { Combat, itemLabel, LifeState, PlayerSnapshot } from '../../utils/playerState';

export interface SquadMember {
  name: string;
  snapshot: PlayerSnapshot;
}

const LIFE_STYLES: Record<LifeState, string> = {
  alive: 'border-tact-signal/60 bg-tact-signal/15 text-tact-signal',
  knocked: 'border-tact-gold/60 bg-tact-gold/15 text-tact-gold',
  dead: 'border-tact-blood/60 bg-tact-blood/20 text-red-300',
};

const LIFE_DOTS: Record<LifeState, string> = {
  alive: 'bg-tact-signal',
  knocked: 'bg-tact-gold',
  dead: 'bg-tact-blood',
};

const SLOT_LABELS: Record<string, string> = {
  Main: 'Primary',
  Handgun: 'Pistol',
  Melee: 'Melee',
};

const healthColor = (hp: number) =>
  hp > 50 ? 'bg-tact-signal' : hp > 25 ? 'bg-tact-gold' : 'bg-tact-blood';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="border-b border-tact-rim px-4 py-3 last:border-b-0">
    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">
      {title}
    </div>
    {children}
  </div>
);

const ArmorSlot: React.FC<{ label: string; level: number | null }> = ({ label, level }) => (
  <div
    className={`flex-1 border px-2 py-1.5 text-center ${
      level ? 'border-tact-rim bg-tact-steel' : 'border-tact-rim/50 bg-transparent'
    }`}
  >
    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-tact-mute">{label}</div>
    <div className={`font-display text-lg ${level ? 'text-tact-fog' : 'text-tact-mute/50'}`}>
      {level ? `LV${level}` : '—'}
    </div>
  </div>
);

const CombatStats: React.FC<{ combat: Combat }> = ({ combat }) => (
  <div className="grid grid-cols-3 gap-1.5">
    {[
      ['Damage', Math.round(combat.damage)],
      ['Kills', combat.kills],
      ['Knocks', combat.knocks],
    ].map(([label, value]) => (
      <div key={label} className="border border-tact-rim bg-tact-steel px-2 py-1.5 text-center">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-tact-mute">
          {label}
        </div>
        <div className="font-display text-xl leading-tight text-tact-flare">{value}</div>
      </div>
    ))}
  </div>
);

/** Status, health, armor, guns and throwables at one replay time. */
const PlayerDetails: React.FC<{ snapshot: PlayerSnapshot }> = ({ snapshot }) => {
  const { life, activity, gear } = snapshot;
  const hp = Math.max(0, Math.min(100, snapshot.health));
  const throwables = Object.entries(gear.throwables);

  return (
    <>
      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.2em] ${LIFE_STYLES[life]}`}
          >
            {life}
          </span>
          {activity && life !== 'dead' && (
            <span className="font-hud text-sm text-tact-sand">{activity}</span>
          )}
        </div>
      </Section>

      <Section title="Health">
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 border border-tact-rim bg-tact-void">
            <div className={`h-full ${healthColor(hp)}`} style={{ width: `${hp}%` }} />
          </div>
          <span className="w-8 text-right font-mono text-sm text-tact-fog">{Math.round(hp)}</span>
        </div>
      </Section>

      <Section title="Armor">
        <div className="flex gap-1.5">
          <ArmorSlot label="Helmet" level={gear.helmet} />
          <ArmorSlot label="Vest" level={gear.vest} />
          <ArmorSlot label="Pack" level={gear.backpack} />
        </div>
      </Section>

      <Section title="Guns">
        {gear.guns.length === 0 ? (
          <div className="font-hud text-sm text-tact-mute">Unarmed</div>
        ) : (
          <ul className="space-y-1">
            {gear.guns.map((gun) => (
              <li
                key={`${gun.slot}-${gun.name}`}
                className="flex items-baseline justify-between gap-2 border-l-2 border-tact-gold/60 bg-tact-steel/60 px-2 py-1"
              >
                <span className="font-hud text-base font-semibold text-tact-fog">
                  {itemLabel(gun.name)}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-tact-mute">
                  {SLOT_LABELS[gun.slot] ?? gun.slot}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Utils">
        {throwables.length === 0 ? (
          <div className="font-hud text-sm text-tact-mute">None</div>
        ) : (
          <ul className="space-y-0.5">
            {throwables.map(([name, count]) => (
              <li key={name} className="flex justify-between font-hud text-sm text-tact-fog">
                <span>{itemLabel(name)}</span>
                <span className="font-mono text-tact-sand">×{count}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
};

/** Collapsed: name, damage, kills/knocks. Expanded: full details. */
const TeammateCard: React.FC<{ member: SquadMember }> = ({ member }) => {
  const [open, setOpen] = useState(false);
  const { life, combat } = member.snapshot;

  return (
    <div className="border-b border-tact-rim">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-tact-steel/60"
      >
        <span className={`h-2 w-2 shrink-0 ${LIFE_DOTS[life]}`} title={life} />
        <span
          className={`min-w-0 flex-1 truncate font-hud text-base font-semibold ${
            life === 'dead' ? 'text-tact-mute line-through' : 'text-tact-fog'
          }`}
        >
          {member.name}
        </span>
        <span className="shrink-0 text-right font-mono text-[10px] uppercase leading-tight tracking-[0.12em] text-tact-sand">
          <span className="block">{Math.round(combat.damage)} dmg</span>
          <span className="block text-tact-mute">
            {combat.kills}K / {combat.knocks}KN
          </span>
        </span>
        <svg
          className={`h-3 w-3 shrink-0 text-tact-mute transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-tact-rim/60 bg-tact-void/40">
          <PlayerDetails snapshot={member.snapshot} />
        </div>
      )}
    </div>
  );
};

const ASIDE =
  'w-full shrink-0 border-tact-rim bg-tact-ink lg:max-h-[min(70vh,720px)] lg:w-64 lg:overflow-y-auto no-scrollbar';

/** Left of the map: the searched player in full. */
export const FocusPanel: React.FC<{ focus: SquadMember }> = ({ focus }) => (
  <aside className={`${ASIDE} border-b lg:border-b-0 lg:border-r`}>
    <div className="border-b border-tact-rim px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">
        Operator
      </div>
      <div className="mb-2 truncate font-display text-2xl tracking-[0.06em] text-tact-flare">
        {focus.name}
      </div>
      <CombatStats combat={focus.snapshot.combat} />
    </div>
    <PlayerDetails snapshot={focus.snapshot} />
  </aside>
);

/** Right of the map: collapsible teammate cards. */
export const TeammatesPanel: React.FC<{ teammates: SquadMember[] }> = ({ teammates }) => (
  <aside className={`${ASIDE} border-t lg:border-l lg:border-t-0`}>
    <div className="border-b border-tact-rim bg-tact-panel px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-tact-mute">
      Squad
    </div>
    {teammates.map((m) => (
      <TeammateCard key={m.name} member={m} />
    ))}
  </aside>
);
