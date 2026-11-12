import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Box } from '@mui/material';
import { useAppearance } from '../../app/lib/AppearanceContext';
import { colors, withAlpha } from '../../app/theme';
import { celestial, skyColors, skyTime, sunTimes } from './sky';

// A few fixed stars, as % positions, shown at night.
const STARS = [
  [12, 22], [28, 12], [41, 30], [57, 16], [66, 38], [74, 10], [83, 26], [91, 42], [35, 48], [8, 52], [50, 6], [95, 14],
];

// For trying out the sky at other times: /?sky=19:30 shows half past seven in the evening.
function previewMinutes() {
  const match = new URLSearchParams(window.location.search).get('sky')?.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Roughly where the user is, without asking: longitude from the time zone's standard offset (15° an hour), and a
// mid latitude in the right hemisphere. Close enough for sunrise and sunset to land within about half an hour.
const SOUTHERN = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji)|^America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|Lima|La_Paz)|^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone)|^Indian\/(Mauritius|Reunion)/;

function guessLocation() {
  const year = new Date().getFullYear();
  const standardOffset = Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    // Northern hemisphere then.
  }
  return { lat: SOUTHERN.test(zone) ? -35 : 40, lon: -standardOffset / 4 };
}

// The Today header's background: a sky that follows the clock and the real sunrise and sunset, with the sun or
// moon on its arc.
export function TodaySky({ minutes: clockMinutes, children }: { minutes: number; children: ReactNode }) {
  const { mode } = useAppearance();
  const minutes = previewMinutes() ?? clockMinutes;
  // Today's real sunrise and sunset where the user (roughly) is, so it's dark here when it's dark outside.
  const today = format(new Date(), 'yyyy-MM-dd');
  const sun = useMemo(() => {
    const { lat, lon } = guessLocation();
    return sunTimes(today, lat, lon, -new Date().getTimezoneOffset());
  }, [today]);
  const { top, bottom } = skyColors(skyTime(minutes, sun), mode);
  const body = celestial(minutes, sun);
  const night = body.body === 'moon';
  // Stars fade in and out around dusk and dawn.
  const starOpacity = night ? Math.min(1, body.x * 6, (1 - body.x) * 6) * (mode === 'dark' ? 0.9 : 0.5) : 0;

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '24px',
        px: { xs: 2.25, sm: 3.5 },
        py: { xs: 2.5, sm: 3.5 },
        background: `radial-gradient(120% 140% at ${body.x * 100}% 0%, ${withAlpha(colors.accent200, 35)}, transparent 60%), linear-gradient(180deg, ${top}, ${bottom})`,
        border: `1px solid ${colors.grey200}`,
        transition: 'background 1s linear',
      }}
    >
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {STARS.map(([x, y], i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: '50%',
              backgroundColor: mode === 'dark' ? '#fff' : colors.accent400,
              opacity: starOpacity,
              transition: 'opacity 2s ease',
              animation: `twinkle ${2.5 + (i % 4) * 0.7}s ease-in-out ${i * 0.3}s infinite alternate`,
              '@keyframes twinkle': { from: { transform: 'scale(1)' }, to: { transform: 'scale(0.4)' } },
            }}
          />
        ))}
        <Box
          sx={{
            position: 'absolute',
            // The arc stays in the top-right of the banner, clear of the greeting and the progress line below it:
            // rising on the left of that area, highest at midday, setting on the right. It fades as it nears
            // the horizon.
            left: `calc(${55 + body.x * 40}% - 18px)`,
            top: `calc(${42 - body.y * 30}% - 18px)`,
            opacity: 0.45 + 0.55 * Math.min(1, body.y * 3),
            width: 36,
            height: 36,
            borderRadius: '50%',
            transition: 'left 1s linear, top 1s linear, opacity 1s linear',
            ...(night
              ? {
                  // A crescent: the disc with a sky-coloured shadow taking a bite out of it.
                  backgroundColor: 'transparent',
                  boxShadow: `inset -9px 4px 0 0 ${mode === 'dark' ? '#e9e6ff' : '#ffffff'}`,
                  filter: `drop-shadow(0 0 10px ${mode === 'dark' ? 'rgba(233,230,255,0.35)' : 'rgba(120,110,200,0.25)'})`,
                  transform: 'rotate(-20deg)',
                }
              : {
                  background: 'radial-gradient(circle at 40% 40%, #ffe9a8, #ffc94d 70%)',
                  boxShadow: `0 0 24px 8px ${mode === 'dark' ? 'rgba(255,201,77,0.25)' : 'rgba(255,201,77,0.45)'}`,
                }),
          }}
        />
      </Box>
      <Box sx={{ position: 'relative' }}>{children}</Box>
    </Box>
  );
}
