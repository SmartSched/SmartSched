import { Box, ButtonBase, Card, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { toMinutes, type TimeBlock } from '../../../app/lib/planner';
import { categoryColor, colors } from '../../../app/theme';

const SHOWN_PER_DAY = 3;

function shortTime(time: string) {
  const minutes = toMinutes(time);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours % 12 || 12}${mins ? `:${String(mins).padStart(2, '0')}` : ''}${hours < 12 ? 'a' : 'p'}`;
}

interface MonthGridProps {
  dates: string[]; // whole weeks covering the month
  month: string; // YYYY-MM, so days from the weeks either side can be dimmed
  today: string;
  blocksByDate: Map<string, TimeBlock[]>;
  onOpenDay: (date: string) => void;
  onOpenBlock: (block: TimeBlock) => void;
}

// A month at a glance: the first few blocks of each day, and a way into the day for the rest.
export function MonthGrid({ dates, month, today, blocksByDate, onOpenDay, onOpenBlock }: MonthGridProps) {
  return (
    <Card sx={{ overflowX: 'auto' }}>
      <Box sx={{ minWidth: 700 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${colors.grey200}` }}>
          {dates.slice(0, 7).map((date) => (
            <Typography key={date} sx={{ py: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
              {format(parseISO(date), 'EEE')}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {dates.map((date, i) => {
            const blocks = [...(blocksByDate.get(date) ?? [])].sort(
              (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
            );
            const inMonth = date.startsWith(month);
            const isToday = date === today;
            const more = blocks.length - SHOWN_PER_DAY;
            return (
              <Box
                key={date}
                sx={{
                  minHeight: 116,
                  p: 0.75,
                  borderLeft: i % 7 ? `1px solid ${colors.grey200}` : 'none',
                  borderTop: i >= 7 ? `1px solid ${colors.grey200}` : 'none',
                  backgroundColor: inMonth ? colors.surface : colors.surfaceMuted,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.25,
                }}
              >
                <ButtonBase
                  onClick={() => onOpenDay(date)}
                  aria-label={`Open ${format(parseISO(date), 'EEEE, MMMM d')}`}
                  sx={{
                    alignSelf: 'flex-start',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    fontSize: 13,
                    fontWeight: 700,
                    mb: 0.25,
                    backgroundColor: isToday ? colors.accent600 : 'transparent',
                    color: isToday ? colors.surface : inMonth ? 'text.primary' : 'text.secondary',
                    '&:hover': { backgroundColor: isToday ? colors.accent800 : colors.accent100 },
                  }}
                >
                  {format(parseISO(date), 'd')}
                </ButtonBase>
                {blocks.slice(0, SHOWN_PER_DAY).map((block) => (
                  <ButtonBase
                    key={block.id}
                    onClick={() => onOpenBlock(block)}
                    aria-label={`Edit ${block.task?.title ?? block.activity}`}
                    sx={{
                      justifyContent: 'flex-start',
                      gap: 0.5,
                      px: 0.5,
                      py: 0.25,
                      borderRadius: '6px',
                      fontSize: 12,
                      minWidth: 0,
                      color: 'text.primary',
                      backgroundColor: categoryColor(block.type) + '1a',
                      '&:hover': { backgroundColor: categoryColor(block.type) + '33' },
                    }}
                  >
                    <Box aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: categoryColor(block.type) }} />
                    <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                      {shortTime(block.start_time)}
                    </Box>
                    <Box component="span" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {block.task?.title ?? block.activity}
                    </Box>
                  </ButtonBase>
                ))}
                {more > 0 && (
                  <ButtonBase
                    onClick={() => onOpenDay(date)}
                    sx={{ justifyContent: 'flex-start', px: 0.5, fontSize: 12, fontWeight: 600, color: colors.accent600 }}
                  >
                    {more} more
                  </ButtonBase>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Card>
  );
}
