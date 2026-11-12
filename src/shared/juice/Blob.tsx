import { useEffect, useRef, useState } from 'react';
import { Box, useMediaQuery, type Theme } from '@mui/material';
import { motion, useAnimate, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useLocation } from 'react-router';
import { useProfile } from '../../app/lib/ProfileContext';
import { colors } from '../../app/theme';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { restingMood, type BlobMood } from './blobMood';
import { burst } from './burst';
import { onJuice } from './events';
import { playBoop } from './sound';
import { BUDDY_LABELS, useJuicePrefs, type Buddy } from './prefs';

const INK = '#2a2238';
const SIZE = { w: 72, h: 64 };

// The little blob in the corner. Click it and it squishes. It perks up when a task is checked off, cheers
// when a group is cleared, yawns on the evening check-in and sleeps through your sleep hours. It never gets
// sad, sick or upset about anything you skipped.
export function Blob() {
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const nowMs = useCurrentTime(60_000);
  const now = new Date(nowMs);
  const resting = restingMood(now.getHours() * 60 + now.getMinutes(), profile?.survey, pathname);
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'), { noSsr: true });
  const reduceMotion = useReducedMotion();
  const { buddy } = useJuicePrefs();
  const name = BUDDY_LABELS[buddy].toLowerCase();

  const [flash, setFlash] = useState<BlobMood | null>(null);
  const flashTimer = useRef<number>();
  const mood = flash ?? resting;

  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const body = useRef<HTMLDivElement>(null);
  const [blinking, setBlinking] = useState(false);
  const [yawning, setYawning] = useState(false);
  const bops = useRef<number[]>([]);

  // Pupils drift toward the pointer.
  const lookX = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const lookY = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });

  const show = (next: BlobMood, ms: number) => {
    window.clearTimeout(flashTimer.current);
    setFlash(next);
    flashTimer.current = window.setTimeout(() => setFlash(null), ms);
  };

  const hop = async (height: number, times = 1) => {
    if (reduceMotion || !body.current) return;
    for (let i = 0; i < times; i++) {
      await animate(body.current, { y: [0, -height, 0], scaleY: [1, 1.12, 0.88, 1], scaleX: [1, 0.92, 1.1, 1] }, { duration: 0.45, ease: 'easeOut' });
    }
  };

  const squish = async () => {
    if (reduceMotion || !body.current) return;
    await animate(body.current, { scaleX: 1.32, scaleY: 0.68 }, { duration: 0.07 });
    animate(body.current, { scaleX: 1, scaleY: 1 }, { type: 'spring', stiffness: 520, damping: 8 });
  };

  const center = () => {
    const rect = scope.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  };

  // React to the rest of the app.
  useEffect(() => {
    const offs = [
      onJuice('task-done', () => {
        show('happy', 2200);
        hop(14);
      }),
      onJuice('cleared', () => {
        show('cheer', 3000);
        hop(20, 2);
        window.setTimeout(() => burst(center()), 250);
      }),
      onJuice('day-filed', () => {
        show('happy', 2500);
        hop(12);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [reduceMotion]);

  // Blinks every few seconds while awake.
  useEffect(() => {
    if (mood === 'sleep') return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        window.setTimeout(() => setBlinking(false), 140);
        schedule();
      }, 2500 + Math.random() * 3500);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [mood]);

  // On the evening check-in it yawns now and then.
  useEffect(() => {
    if (mood !== 'yawn') return setYawning(false);
    const yawn = () => {
      setYawning(true);
      window.setTimeout(() => setYawning(false), 1800);
    };
    const first = window.setTimeout(yawn, 1500);
    const every = window.setInterval(yawn, 11000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [mood]);

  useEffect(() => {
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const c = center();
        if (!c) return;
        const dx = e.clientX - c.x;
        const dy = e.clientY - c.y;
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 200);
        lookX.set((dx / distance) * 2.6 * reach);
        lookY.set((dy / distance) * 2.2 * reach);
      });
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  const bop = () => {
    playBoop();
    squish();
    const t = Date.now();
    bops.current = [...bops.current.filter((b) => t - b < 2500), t];
    if (bops.current.length >= 8) {
      // Too many bops in a row: it gets a bit dizzy and spins.
      bops.current = [];
      show('dizzy', 2600);
      if (!reduceMotion && body.current) animate(body.current, { rotate: [0, 360, 720] }, { duration: 0.9, ease: 'easeInOut' });
      return;
    }
    // Asleep, it opens its eyes for a moment and then dozes off again.
    show(resting === 'sleep' ? 'idle' : 'boop', resting === 'sleep' ? 2500 : 650);
  };

  const eyesClosed = mood === 'sleep' || (blinking && (mood === 'idle' || mood === 'yawn')) || (mood === 'yawn' && yawning);

  return (
    <Box
      component="button"
      ref={scope}
      type="button"
      onClick={bop}
      aria-label={`Bop the ${name}`}
      title={`Bop the ${name}`}
      sx={{
        position: 'fixed',
        right: { xs: 12, sm: 20 },
        bottom: isMobile ? 84 : 20,
        zIndex: 1050,
        width: SIZE.w,
        height: SIZE.h + 8,
        p: 0,
        border: 0,
        background: 'none',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 2, borderRadius: '50%' },
        '@keyframes buddySpin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        '@keyframes blobBreathe': { from: { transform: 'scaleY(1)' }, to: { transform: 'scaleY(1.04) scaleX(0.985)' } },
        '@keyframes blobZ': {
          '0%': { opacity: 0, transform: 'translate(0, 0) scale(0.6)' },
          '30%': { opacity: 1 },
          '100%': { opacity: 0, transform: 'translate(10px, -22px) scale(1.1)' },
        },
      }}
    >
      {/* Shadow on the "floor"; shrinks when it hops. */}
      <Box
        aria-hidden
        sx={{ position: 'absolute', left: '50%', bottom: 2, width: 44, height: 6, ml: '-22px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.14)' }}
      />
      <motion.div
        ref={body}
        whileHover={reduceMotion ? undefined : { y: -3 }}
        style={{ position: 'absolute', inset: 0, bottom: 6, transformOrigin: '50% 100%' }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            transformOrigin: '50% 100%',
            animation: reduceMotion ? 'none' : `blobBreathe ${mood === 'sleep' ? 2.6 : 1.7}s ease-in-out infinite alternate`,
          }}
        >
          <svg viewBox="0 0 80 72" width={SIZE.w} height={SIZE.h} aria-hidden style={{ overflow: 'visible' }}>
            <BuddyBody buddy={buddy} spin={!reduceMotion} />
            <ellipse cx="22" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity={mood === 'happy' || mood === 'cheer' ? 0.7 : 0.4} />
            <ellipse cx="58" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity={mood === 'happy' || mood === 'cheer' ? 0.7 : 0.4} />
            <motion.g style={{ x: mood === 'sleep' ? 0 : lookX, y: mood === 'sleep' ? 0 : lookY }}>
              <Eye cx={30} cy={40} mood={mood} closed={eyesClosed} side="left" />
              <Eye cx={50} cy={40} mood={mood} closed={eyesClosed} side="right" />
            </motion.g>
            <Mouth mood={mood} yawning={yawning} />
            {mood === 'sleep' && (
              <g fill={INK} style={{ fontFamily: 'inherit', fontWeight: 700 }}>
                {[0, 1, 2].map((i) => (
                  <text
                    key={i}
                    x={62 + i * 3}
                    y={18 - i * 2}
                    fontSize={8 + i * 2}
                    style={{ opacity: 0, animation: reduceMotion ? 'none' : `blobZ 3s ease-out ${i * 1}s infinite`, fill: buddy === 'blob' ? colors.accent600 : '#64748b' }}
                  >
                    z
                  </text>
                ))}
              </g>
            )}
          </svg>
        </Box>
      </motion.div>
    </Box>
  );
}

// The body behind the face, in an 80×72 box. The face sits at the same place on every buddy: eyes at (30, 40) and
// (50, 40), mouth at (40, 51), cheeks at (22, 49) and (58, 49). Only the blob follows the accent colour.
function BuddyBody({ buddy, spin }: { buddy: Buddy; spin?: boolean }) {
  switch (buddy) {
    case 'cloud':
      return (
        <path
          d="M17 68 C7 68 3 59 7 52 C2 44 8 33 19 34 C19 21 31 13 42 17 C50 8 66 12 67 27 C77 29 79 42 73 49 C78 59 71 68 61 68 Z"
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    case 'sunflower': {
      const petals = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);
      return (
        <g>
          <path d="M40 66 L40 76" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" />
          <g style={{ transformOrigin: '40px 42px', animation: spin ? 'buddySpin 40s linear infinite' : 'none' }}>
            {petals.map((angle) => (
              <ellipse key={angle} cx="40" cy="15" rx="6.5" ry="11" transform={`rotate(${angle} 40 42)`} fill="#facc15" stroke="#eab308" strokeWidth="1.2" />
            ))}
          </g>
          <circle cx="40" cy="44" r="22" fill="#c98a3c" />
          <circle cx="40" cy="44" r="22" fill="none" stroke="#a16207" strokeWidth="1.5" strokeDasharray="1.5 3" />
        </g>
      );
    }
    case 'sun': {
      const rays = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
      return (
        <g>
          <g style={{ transformOrigin: '40px 42px', animation: spin ? 'buddySpin 24s linear infinite' : 'none' }}>
            {rays.map((angle) => (
              <path key={angle} d="M40 6 L40 13" transform={`rotate(${angle} 40 42)`} stroke="#f59e0b" strokeWidth="4.5" strokeLinecap="round" />
            ))}
          </g>
          <circle cx="40" cy="42" r="25" fill="#fbbf24" />
          <ellipse cx="30" cy="27" rx="7" ry="4" transform="rotate(-25 30 27)" fill="#fff" opacity="0.4" />
        </g>
      );
    }
    case 'moon':
      return (
        <g>
          <circle cx="40" cy="42" r="28" fill="#fef3c7" opacity="0.35" />
          <circle cx="40" cy="42" r="25" fill="#fde68a" />
          <circle cx="23" cy="30" r="4" fill="#fcd34d" />
          <circle cx="56" cy="26" r="2.6" fill="#fcd34d" />
          <circle cx="57" cy="58" r="3.2" fill="#fcd34d" />
          <circle cx="27" cy="60" r="2" fill="#fcd34d" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M40 8 C61 8 75 25 75 45 C75 61 62 69 40 69 C18 69 5 61 5 45 C5 25 19 8 40 8 Z" style={{ fill: colors.accent400 }} />
          <ellipse cx="27" cy="22" rx="8" ry="4.5" transform="rotate(-25 27 22)" fill="#fff" opacity="0.35" />
        </g>
      );
  }
}

// A still picture of a buddy with its resting face, for the picker in settings.
export function BuddyPreview({ buddy, size = 44 }: { buddy: Buddy; size?: number }) {
  return (
    <svg viewBox="0 0 80 72" width={size} height={(size * 72) / 80} aria-hidden style={{ overflow: 'visible' }}>
      <BuddyBody buddy={buddy} />
      <ellipse cx="22" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity={0.4} />
      <ellipse cx="58" cy="49" rx="4.5" ry="2.6" fill="#f472b6" opacity={0.4} />
      <Eye cx={30} cy={40} mood="idle" closed={false} side="left" />
      <Eye cx={50} cy={40} mood="idle" closed={false} side="right" />
      <Mouth mood="idle" yawning={false} />
    </svg>
  );
}

function Eye({ cx, cy, mood, closed, side }: { cx: number; cy: number; mood: BlobMood; closed: boolean; side: 'left' | 'right' }) {
  const stroke = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {mood === 'happy' || mood === 'cheer' ? (
        <path d="M-3.8 1.6 Q0 -4 3.8 1.6" {...stroke} />
      ) : mood === 'boop' ? (
        <path d={side === 'left' ? 'M-3 -3.2 L2.2 0 L-3 3.2' : 'M3 -3.2 L-2.2 0 L3 3.2'} {...stroke} />
      ) : mood === 'dizzy' ? (
        <path d="M0 0 m-1 0 a1 1 0 1 1 2 0 a2 2 0 1 1 -4 0 a3 3 0 1 1 6 0" {...stroke} strokeWidth={1.5} />
      ) : closed ? (
        <path d="M-3.8 0 Q0 3.2 3.8 0" {...stroke} />
      ) : (
        <>
          <ellipse rx="3.3" ry={mood === 'yawn' ? 2.6 : 4.3} fill={INK} />
          <circle cx="1.1" cy="-1.5" r="1.1" fill="#fff" />
        </>
      )}
    </g>
  );
}

function Mouth({ mood, yawning }: { mood: BlobMood; yawning: boolean }) {
  const stroke = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <g transform="translate(40 51)">
      {mood === 'happy' || mood === 'cheer' ? (
        <path d="M-5.5 -1.5 Q0 7 5.5 -1.5 Z" fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      ) : mood === 'boop' ? (
        <ellipse rx="2.2" ry="2.8" fill={INK} />
      ) : mood === 'yawn' && yawning ? (
        <ellipse rx="3.8" ry="5.2" fill={INK} />
      ) : mood === 'dizzy' ? (
        <path d="M-5 1 Q-2.5 -1.5 0 1 Q2.5 3.5 5 1" {...stroke} />
      ) : mood === 'sleep' || mood === 'yawn' ? (
        <path d="M-2.2 1 L2.2 1" {...stroke} />
      ) : (
        <path d="M-3.2 0 Q0 3.2 3.2 0" {...stroke} />
      )}
    </g>
  );
}
