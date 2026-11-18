// The Kiroween hero scene and its rendered objects.
//
// One rich moment, built in SVG: a moonlit graveyard with depth and drifting
// fog, the living tattered flag, and the verdict set in the scene like a
// headline. Objects with light and gloss (spider, wax seal, jack-o'-lantern,
// ghost) appear only when they mean something:
//   HELD    -> the spider drops in and waits
//   SEIZED  -> a ghost rises over the graves, the spider drops in
//   CLEARED -> a jack-o'-lantern lights up in the foreground
// Every animation stops when the system asks to reduce motion (CSS).

import React from 'react';

const BAT = 'M15 6C11 0 5 1 0 4C4 5 5 8 6 10C8 8 11 8 13 10L15 13L17 10C19 8 22 8 24 10C25 8 26 5 30 4C25 1 19 0 15 6Z';
const CLOTH = 'M20 14H112L101 28L109 36L95 48L106 60L95 70L112 86H20Z';
const CHECK = 'M38 50l15 15 31-34';

// Shared paint: gradients and soft shadows used by the scene's objects.
function Defs() {
  return (
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0B0E1E" />
        <stop offset="0.55" stopColor="#1A2140" />
        <stop offset="1" stopColor="#2A3354" />
      </linearGradient>
      <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#F6E7BE" stopOpacity="0.55" />
        <stop offset="0.35" stopColor="#C9D3F0" stopOpacity="0.18" />
        <stop offset="1" stopColor="#C9D3F0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="moon" cx="0.4" cy="0.38" r="0.65">
        <stop offset="0" stopColor="#FFF6DC" />
        <stop offset="0.7" stopColor="#F0DFB0" />
        <stop offset="1" stopColor="#D9C48E" />
      </radialGradient>
      <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#B9C3E0" stopOpacity="0" />
        <stop offset="0.5" stopColor="#B9C3E0" stopOpacity="0.22" />
        <stop offset="1" stopColor="#B9C3E0" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="clothShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#C99E33" />
        <stop offset="0.18" stopColor="#F1CC63" />
        <stop offset="0.42" stopColor="#D8AE45" />
        <stop offset="0.66" stopColor="#F4D272" />
        <stop offset="1" stopColor="#C99B30" />
      </linearGradient>
      <linearGradient id="pole" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8E8879" />
        <stop offset="0.45" stopColor="#E6E0D0" />
        <stop offset="1" stopColor="#7C766A" />
      </linearGradient>
      <radialGradient id="ghostBody" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.7" stopColor="#E7ECF7" stopOpacity="0.95" />
        <stop offset="1" stopColor="#B8C2DC" stopOpacity="0.6" />
      </radialGradient>
      <radialGradient id="pumpkin" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#FFB45E" />
        <stop offset="0.55" stopColor="#EE7A1D" />
        <stop offset="1" stopColor="#A9470D" />
      </radialGradient>
      <radialGradient id="pumpkinGlow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#FFB45E" stopOpacity="0.5" />
        <stop offset="1" stopColor="#FFB45E" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="flame" cx="0.5" cy="0.6" r="0.6">
        <stop offset="0" stopColor="#FFF6C8" />
        <stop offset="0.5" stopColor="#FFC94A" />
        <stop offset="1" stopColor="#F07A1E" />
      </radialGradient>
      <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3A4263" />
        <stop offset="0.35" stopColor="#262C47" />
        <stop offset="1" stopColor="#171B30" />
      </linearGradient>
      <radialGradient id="spBodyS" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#4A4F63" />
        <stop offset="0.45" stopColor="#1A1C26" />
        <stop offset="1" stopColor="#07080D" />
      </radialGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
    </defs>
  );
}

/** Small flag for the compact header (Calm level and Standard theme). */
export function Flag({ alive = true, size = 44 }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 -8 120 150" aria-hidden="true">
      <Defs />
      <rect x="10" y="14" width="10" height="118" rx="5" fill="url(#pole)" />
      {alive && <Ghost x={0} y={0} small />}
      <g className={alive ? 'ctp-cloth' : undefined}>
        <path d={CLOTH} fill="url(#clothShade)" />
        <path d={CHECK} fill="none" stroke="#10264A" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Ghost({ x, y, small, rising }) {
  return (
    <g transform={`translate(${x},${y})`} className={rising ? 'ctp-rise' : 'ctp-ghost'}>
      {small ? (
        <>
          <path d="M7 10q0-16 8-16t8 16l-3-3-2 3-3-3-3 3-2-3z" fill="url(#ghostBody)" />
          <circle cx="12" cy="1" r="1.5" fill="#15182A" />
          <circle cx="18" cy="1" r="1.5" fill="#15182A" />
        </>
      ) : (
        <>
          <path d="M0 40V18C0 6 9 0 18 0s18 6 18 18v22l-5-4-4 5-4-5-5 5-4-5-5 5-4-5z" fill="url(#ghostBody)" />
          <ellipse cx="12" cy="17" rx="2.6" ry="3.6" fill="#11142A" />
          <ellipse cx="24" cy="17" rx="2.6" ry="3.6" fill="#11142A" />
          <ellipse cx="18" cy="27" rx="3" ry="4" fill="#11142A" opacity=".85" />
        </>
      )}
    </g>
  );
}

function SceneSpider({ x }) {
  return (
    <g transform={`translate(${x},0)`}>
      <g className="ctp-dangle">
        <line x1="20" y1="-200" x2="20" y2="82" stroke="#E6E9F5" strokeWidth="0.6" opacity=".6" />
        <g className="ctp-legs" stroke="#07080D" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 88 L4 80 L0 88 M14 92 L2 92 L-1 100 M14 96 L4 102 L2 110 M15 99 L8 108 L8 116" />
          <path d="M26 88 L36 80 L40 88 M26 92 L38 92 L41 100 M26 96 L36 102 L38 110 M25 99 L32 108 L32 116" />
        </g>
        <ellipse cx="20" cy="98" rx="11" ry="12" fill="url(#spBodyS)" />
        <ellipse cx="20" cy="84" rx="7.5" ry="6.5" fill="url(#spBodyS)" />
        <ellipse cx="15.5" cy="93" rx="3.2" ry="2" fill="#FFFFFF" opacity=".22" transform="rotate(-30 15.5 93)" />
        <circle cx="16.8" cy="84" r="3.2" fill="#F4F5FA" />
        <circle cx="23.2" cy="84" r="3.2" fill="#F4F5FA" />
        <circle cx="17.6" cy="84.8" r="1.7" fill="#0B0C12" className="ctp-pupil" />
        <circle cx="24" cy="84.8" r="1.7" fill="#0B0C12" className="ctp-pupil" />
        <circle cx="17" cy="83.6" r="0.6" fill="#FFFFFF" />
        <circle cx="23.4" cy="83.6" r="0.6" fill="#FFFFFF" />
      </g>
    </g>
  );
}

function Lantern({ x, y }) {
  return (
    <g transform={`translate(${x},${y}) scale(1.6)`} className="ctp-lantern">
      <ellipse cx="22" cy="20" rx="44" ry="34" fill="url(#pumpkinGlow)" className="ctp-flicker" />
      <ellipse cx="22" cy="40" rx="24" ry="4" fill="#05060E" opacity=".55" />
      <path d="M2 22c0-12 9-18 20-18s20 6 20 18-9 18-20 18S2 34 2 22z" fill="url(#pumpkin)" />
      <path d="M14 6c-4 5-5 26 0 33M30 6c4 5 5 26 0 33M22 4v36" stroke="#A9470D" strokeWidth="1.2" fill="none" opacity=".55" />
      <path d="M20 5c0-4 2-6 5-7" stroke="#3E5A2A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g className="ctp-flicker">
        <path d="M8 19l6-7 5 7zM25 19l5-7 6 7z" fill="url(#flame)" />
        <path d="M20 22l2-3 2 3z" fill="url(#flame)" />
        <path d="M8 26q14 11 28 0l-3 5-3-2-3 4-4-4-4 4-3-4-3 2-3-5z" fill="url(#flame)" />
      </g>
      <ellipse cx="13" cy="12" rx="5" ry="2.5" fill="#FFFFFF" opacity=".25" transform="rotate(-25 13 12)" />
    </g>
  );
}

/**
 * The moonlit graveyard. Verdict and subtitle are set inside the scene.
 * verdict: CLEARED | HELD | SEIZED | REFUSED; line: the short status line.
 */
export function Scene({ verdict, line, subtitle, haunted }) {
  const v = verdict === 'CLEARED' ? 'Cleared' : verdict.charAt(0) + verdict.slice(1).toLowerCase();
  return (
    <svg className="ctp-scene" width="100%" viewBox="0 0 640 220" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Clear to Pay: ${v}. ${line}`}>
      <Defs />
      <rect width="640" height="220" fill="url(#sky)" />
      {[[60, 22], [150, 40], [232, 18], [300, 52], [372, 26], [610, 30], [446, 14], [92, 70], [590, 84]].map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.2 : 0.8} fill="#E8ECFA" className={`ctp-star s${i % 3}`} />
      ))}
      <circle cx="520" cy="66" r="110" fill="url(#halo)" />
      <circle cx="520" cy="66" r="42" fill="url(#moon)" />
      <g fill="#CDB98A" opacity=".55">
        <circle cx="506" cy="54" r="6" /><circle cx="532" cy="80" r="4.5" /><circle cx="538" cy="52" r="3" /><circle cx="512" cy="84" r="2.5" />
      </g>
      <g className="ctp-cloud" opacity=".5">
        <path d="M440 70c10-10 30-8 38 0 10-6 26-4 30 6H430c0-4 4-6 10-6z" fill="#3C4670" />
      </g>
      <g className="ctp-bat"><g className="ctp-wing"><path d={BAT} fill="#06070F" /></g></g>
      {haunted && <g className="ctp-bat ctp-bat2"><g className="ctp-wing"><path d={BAT} fill="#06070F" /></g></g>}

      {/* far hills and a dead tree */}
      <path d="M0 162 Q90 132 190 150 T380 140 T640 146 V220 H0Z" fill="#20274A" />
      <g stroke="#141831" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M600 160 C596 120 612 96 604 66" />
        <path d="M602 104 L626 86 M604 84 L588 70 M598 126 L578 116 M612 92 L620 72" strokeWidth="3" />
      </g>
      {/* iron fence */}
      <g stroke="#11152B" strokeWidth="2">
        <path d="M210 168 H460" />
        {Array.from({ length: 14 }, (_, i) => 214 + i * 18).map((fx) => <path key={fx} d={`M${fx} 178 V150 l-3 5 M${fx} 150 l3 5`} />)}
      </g>
      {/* tombstones lit from the moon side (right) */}
      {[[260, 162, 22, 34], [318, 168, 16, 26], [404, 160, 20, 36], [470, 170, 15, 24]].map(([tx, ty, w, h], i) => (
        <g key={i}>
          <path d={`M${tx} ${ty + h}v-${h - w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0v${h - w / 2}z`} fill="url(#stone)" transform={`translate(0,${-h + 14})`} />
        </g>
      ))}
      <path d="M0 196 Q140 178 300 190 T640 186 V220 H0Z" fill="#0E1124" />

      {verdict === 'SEIZED' && <Ghost x={370} y={110} rising />}
      {verdict === 'CLEARED' && <Lantern x={512} y={150} />}
      {(verdict === 'HELD' || verdict === 'SEIZED') && <SceneSpider x={486} />}

      {/* drifting fog */}
      <g className="ctp-fog">
        <rect x="-200" y="150" width="1040" height="46" fill="url(#fog)" />
      </g>
      <g className="ctp-fog ctp-fog2">
        <rect x="-200" y="172" width="1040" height="40" fill="url(#fog)" />
      </g>

      {/* the flag */}
      <g transform="translate(28,28) scale(.86)">
        <ellipse cx="15" cy="168" rx="18" ry="3" fill="#05060E" opacity=".5" />
        <rect x="10" y="14" width="10" height="154" rx="5" fill="url(#pole)" />
        <Ghost x={0} y={0} small />
        <g className="ctp-cloth">
          <path d={CLOTH} fill="url(#clothShade)" />
          <path d="M84 14l-6 10M60 86l4-8" stroke="#141831" strokeWidth="2.5" strokeLinecap="round" />
          <path d={CHECK} fill="none" stroke="#0B1A33" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity=".35" transform="translate(1.5,2)" />
          <path d={CHECK} fill="none" stroke="#10264A" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      {/* headline set in the scene */}
      <text x="150" y="58" className="ctp-serif" fontSize="15" fill="#B7BED6" letterSpacing="1.5">Clear to Pay</text>
      <text x="148" y="104" className="ctp-serif" fontSize="46" fill={verdict === 'CLEARED' ? '#CFE8B8' : verdict === 'HELD' ? '#F2D58A' : '#F2A79C'}>{v}</text>
      <text x="150" y="128" fontSize="13" fill="#D9DDEB">{line}</text>
      <text x="150" y="146" fontSize="12" fill="#8E95B0">{subtitle}</text>
    </svg>
  );
}

/** A glossy spider on its thread, dropping in from the top edge. */
export function Spider() {
  return (
    <div className="ctp-spider-wrap" aria-hidden="true">
      <svg className="ctp-spider" viewBox="0 0 40 120">
        <defs>
          <radialGradient id="spBody" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#4A4F63" />
            <stop offset="0.45" stopColor="#1A1C26" />
            <stop offset="1" stopColor="#07080D" />
          </radialGradient>
          <radialGradient id="spEye" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#D5D9E6" />
          </radialGradient>
        </defs>
        <line x1="20" y1="0" x2="20" y2="80" stroke="#D9DDEB" strokeWidth="0.7" opacity=".7" />
        <g className="ctp-legs" stroke="#0C0D14" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 88 L4 80 L0 88 M14 92 L2 92 L-1 100 M14 96 L4 102 L2 110 M15 99 L8 108 L8 116" />
          <path d="M26 88 L36 80 L40 88 M26 92 L38 92 L41 100 M26 96 L36 102 L38 110 M25 99 L32 108 L32 116" />
        </g>
        <ellipse cx="20" cy="98" rx="11" ry="12" fill="url(#spBody)" />
        <ellipse cx="20" cy="84" rx="7.5" ry="6.5" fill="url(#spBody)" />
        <ellipse cx="16" cy="93" rx="3" ry="2" fill="#FFFFFF" opacity=".18" transform="rotate(-30 16 93)" />
        <circle cx="16.8" cy="84" r="3.2" fill="url(#spEye)" />
        <circle cx="23.2" cy="84" r="3.2" fill="url(#spEye)" />
        <circle cx="17.6" cy="84.8" r="1.7" fill="#0B0C12" className="ctp-pupil" />
        <circle cx="24" cy="84.8" r="1.7" fill="#0B0C12" className="ctp-pupil" />
        <circle cx="17" cy="83.6" r="0.6" fill="#FFFFFF" />
        <circle cx="23.4" cy="83.6" r="0.6" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

/** A wax seal: glossy red wax with an embossed flag check when sealed. */
export function WaxSeal({ sealed, size = 28 }) {
  if (!sealed) {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" opacity=".6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id="wax" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#D8423A" />
          <stop offset="0.6" stopColor="#9E1F1B" />
          <stop offset="1" stopColor="#5E0E0D" />
        </radialGradient>
      </defs>
      <ellipse cx="21" cy="23" rx="16" ry="14" fill="#000" opacity=".25" />
      <path d="M20 2c4 0 5 3 8 3s6 3 6 6 3 4 3 9-3 6-3 9-3 6-6 6-4 3-8 3-5-3-8-3-6-3-6-6-3-4-3-9 3-6 3-9 3-6 6-6 4-3 8-3z" fill="url(#wax)" />
      <circle cx="20" cy="20" r="10.5" fill="none" stroke="#6E1210" strokeWidth="1.4" opacity=".7" />
      <path d="M14.5 20.5l4 4 7.5-8.5" fill="none" stroke="#5A0B0A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 19.8l4 4 7.5-8.5" fill="none" stroke="#E7655C" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
      <ellipse cx="13" cy="10" rx="5" ry="2.2" fill="#FFFFFF" opacity=".35" transform="rotate(-30 13 10)" />
    </svg>
  );
}
