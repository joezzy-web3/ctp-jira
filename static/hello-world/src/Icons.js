// One small set of line icons: 16px, 1.5 stroke, colour from the text.

import React from 'react';

const P = {
  ghost: 'M4 14V7a4 4 0 018 0v7l-1.5-1.2L9 14l-1-1.2L7 14l-1.5-1.2zM6.5 7.5h0M9.5 7.5h0',
  grave: 'M4 14V6a4 4 0 018 0v8M3 14h10M8 6v4M6.5 7.5h3',
  candle: 'M6 14V7h4v7M5 14h6M8 7V5.5M8 2.5c1 1 1 2 0 2.6-1-.6-1-1.6 0-2.6z',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z',
  ball: 'M8 11a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM4.5 14h7l-1-3h-5zM6 5.5a2 2 0 012-1.5',
  lock: 'M4.5 7V5.5a3.5 3.5 0 017 0V7M3.5 7h9v7h-9zM8 10v1.5',
  pass: 'M3.5 8.5l3 3 6-7',
  wait: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM8 4.5V8l2.5 1.5',
  fail: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5.5 5.5l5 5M10.5 5.5l-5 5',
  soundOn: 'M2.5 6h2.5l3.5-3v10l-3.5-3H2.5zM11 5.5a3.5 3.5 0 010 5M12.8 3.8a6 6 0 010 8.4',
  soundOff: 'M2.5 6h2.5l3.5-3v10l-3.5-3H2.5zM11 6l3.5 4M14.5 6L11 10',
};

export function Icon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
