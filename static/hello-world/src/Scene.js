// Visual pieces for the panel header: the tattered flag ("Flag A": calm
// drift, bobbing ghost, a bat over the moon), the moonlit graveyard scene,
// and the spider that drops in when an invoice is held or seized.
// All motion stops for people who ask their system to reduce motion (CSS).

import React from 'react';

const BAT = 'M15 6C11 0 5 1 0 4C4 5 5 8 6 10C8 8 11 8 13 10L15 13L17 10C19 8 22 8 24 10C25 8 26 5 30 4C25 1 19 0 15 6Z';
const CLOTH = 'M20 14H112L101 28L109 36L95 48L106 60L95 70L112 86H20Z';
const CHECK = 'M38 50l15 15 31-34';

/** The flag on its pole. `alive` adds the ghost and the motion. */
export function Flag({ alive = true, size = 44, poleHeight = 118 }) {
  return (
    <svg width={size} height={size * (poleHeight + 30) / 120} viewBox={`0 -8 120 ${poleHeight + 30}`} aria-hidden="true">
      <rect x="10" y="14" width="10" height={poleHeight} rx="5" fill="#C9C2B0" />
      {alive && (
        <g className="ctp-ghost">
          <path d="M7 10q0-16 8-16t8 16l-3-3-2 3-3-3-3 3-2-3z" fill="#F7F3EA" />
          <circle cx="12" cy="1" r="1.5" fill="#15182A" />
          <circle cx="18" cy="1" r="1.5" fill="#15182A" />
        </g>
      )}
      <g className={alive ? 'ctp-cloth' : undefined}>
        <path d={CLOTH} fill="#E6BE4F" />
        {alive && <path d="M84 14l-6 10M60 86l4-8" stroke="#1C2034" strokeWidth="2.5" strokeLinecap="round" />}
        <path d={CHECK} fill="none" stroke="#10264A" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** The moonlit graveyard header (Kiroween theme, balanced and haunted). */
export function Scene({ title, subtitle, haunted }) {
  return (
    <svg className="ctp-scene" width="100%" height="140" viewBox="0 0 640 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="640" height="140" fill="#1C2034" />
      <circle cx="520" cy="58" r="42" fill="#F3E3B5" />
      <circle cx="504" cy="46" r="6" fill="#E6D3A0" />
      <circle cx="534" cy="72" r="4" fill="#E6D3A0" />
      <g className="ctp-bat"><g className="ctp-wing"><path d={BAT} fill="#0E0818" /></g></g>
      {haunted && <g className="ctp-bat ctp-bat2"><g className="ctp-wing"><path d={BAT} fill="#0E0818" /></g></g>}
      <path d="M0 124 Q120 110 240 120 T480 116 T640 120 L640 140 L0 140Z" fill="#11142A" />
      <path d="M300 120v-20a9 9 0 0118 0v20zM340 122v-14a7 7 0 0114 0v14zM420 118v-12h-6v-6h6v-6h6v6h6v6h-6v12zM580 120v-18a8 8 0 0116 0v18z" fill="#11142A" />
      <path d="M612 120 C608 94 620 76 614 58 M614 76 L630 66 M612 92 L598 84" stroke="#11142A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <g transform="translate(34,8) scale(.82)">
        <rect x="10" y="14" width="10" height="136" rx="5" fill="#C9C2B0" />
        <g className="ctp-ghost">
          <path d="M7 10q0-16 8-16t8 16l-3-3-2 3-3-3-3 3-2-3z" fill="#F7F3EA" />
          <circle cx="12" cy="1" r="1.5" fill="#15182A" />
          <circle cx="18" cy="1" r="1.5" fill="#15182A" />
        </g>
        <g className="ctp-cloth">
          <path d={CLOTH} fill="#E6BE4F" />
          <path d="M84 14l-6 10M60 86l4-8" stroke="#1C2034" strokeWidth="2.5" strokeLinecap="round" />
          <path d={CHECK} fill="none" stroke="#10264A" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <text x="160" y="60" className="ctp-display" fontSize="30" fill="#E6BE4F">{title}</text>
      <text x="161" y="86" fontSize="13" fill="#A9ADBD">{subtitle}</text>
    </svg>
  );
}

/** Cobweb in the corner and a spider dropping on its thread. */
export function Spider() {
  return (
    <div className="ctp-spider-wrap" aria-hidden="true">
      <svg width="90" height="74" viewBox="0 0 110 90" className="ctp-web">
        <g fill="none" stroke="#3A4060" strokeWidth="1">
          <path d="M110 0L20 0M110 0L110 85M110 0L35 55M110 0L70 85M110 0L58 18" />
          <path d="M95 0Q100 10 110 14M78 0Q88 22 110 30M60 0Q76 34 110 48M42 0Q62 48 110 66" />
        </g>
      </svg>
      <svg className="ctp-spider" viewBox="0 0 22 70">
        <line x1="11" y1="0" x2="11" y2="48" stroke="#C9C2B0" strokeWidth="0.8" />
        <g className="ctp-legs" stroke="#0E0818" strokeWidth="1.6" fill="none" strokeLinecap="round">
          <path d="M8 50L1 45M8 53L0 54M8 56L1 62M14 50L21 45M14 53L22 54M14 56L21 62" />
        </g>
        <ellipse cx="11" cy="55" rx="5" ry="6" fill="#0E0818" />
        <circle cx="11" cy="49" r="3" fill="#0E0818" />
        <circle cx="9.8" cy="48.6" r="0.9" fill="#E2574C" />
        <circle cx="12.2" cy="48.6" r="0.9" fill="#E2574C" />
      </svg>
    </div>
  );
}
