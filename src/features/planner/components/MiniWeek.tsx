import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { toMinutes } from '../../../app/lib/planner';
import type { DowntimeRange } from '../../../app/lib/downtime';
import { categoryColor, colors } from '../../../app/theme';

export interface MiniBlock {
  date: string;
  start_time: string;
  end_time: string;
  type?: string;
  activity?: string;
}

interface MiniWeekProps {
  dates: string[]; // the 7 days shown, in order
  existing: MiniBlock[]; // what's already planned, drawn faintly
  added: MiniBlock[]; // what this option would add, drawn solid
  downtime: DowntimeRange[];
  startHour?: number;
  endHour?: number;
  height?: number;
  label: string; // what a screen reader hears instead of the picture
}

// A small week at a glance: the week's existing blocks in their colours, faded, and the blocks an option
// would add in the solid accent colour on top, so options can be compared side by side.
export function MiniWeek({ dates, existing, added, downtime, startHour = 7, endHour = 23, height = 200, label }: MiniWeekProps) {
  const span = (endHour - startHour) * 60;
  const y = (minutes: number) => ((Math.min(Math.max(minutes, startHour * 60), endHour * 60) - startHour * 60) / span) * 100;

  const bar = (block: MiniBlock, key: string, isAdded: boolean) => {
    const top = y(toMinutes(block.start_time));
    const bottom = y(toMinutes(block.end_time));
    if (bottom <= top) return null;
    return (
      <Box
        key={key}
        sx={{
          position: 'absolute',
          left: isAdded ? '8%' : '14%',
          right: isAdded ? '8%' : '14%',
          top: `${top}%`,
          height: `max(${bottom - top}%, 3px)`,
          borderRadius: '3px',
          backgroundColor: isAdded ? colors.accent600 : categoryColor(block.type ?? '') + '55',
          zIndex: isAdded ? 2 : 1,
        }}
      />
    );
  };

  return (
    <Box role="img" aria-label={label}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', mb: 0.5 }} aria-hidden>
        {dates.map((date) => (
          <Typography key={date} sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', textAlign: 'center' }}>
            {format(parseISO(date), 'EEEEE')}
          </Typography>
        ))}
      </Box>
      <Box
        aria-hidden
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          height,
          border: `1px solid ${colors.grey200}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {dates.map((date, i) => (
          <Box key={date} sx={{ position: 'relative', borderLeft: i > 0 ? `1px solid ${colors.grey200}` : 'none' }}>
            {downtime.map((range) => {
              const top = y(range.start);
              const bottom = y(range.end);
              return bottom > top ? (
                <Box
                  key={range.start}
                  sx={{ position: 'absolute', left: 0, right: 0, top: `${top}%`, height: `${bottom - top}%`, backgroundColor: colors.surfaceMuted }}
                />
              ) : null;
            })}
            {existing.filter((b) => b.date === date).map((b, j) => bar(b, `e${j}`, false))}
            {added.filter((b) => b.date === date).map((b, j) => bar(b, `a${j}`, true))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
