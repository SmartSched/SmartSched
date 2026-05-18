import { useState } from 'react';
import { Card, CardContent, IconButton, Typography, Box, Chip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ChevronLeft, ChevronRight, ViewDay, ViewWeek, CalendarViewMonth } from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, startOfWeek, endOfWeek, addDays } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: 'study' | 'class' | 'personal' | 'assignment';
  color: string;
}

interface CalendarProps {
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  selectedDate: Date;
}

export function Calendar({ events, onDateClick, selectedDate }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const startDayOfWeek = monthStart.getDay();
  const emptyDays = Array(startDayOfWeek).fill(null);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(event.date, day));
  };

  return (
    <Card sx={{ height: '100%', borderRadius: '16px' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={prevMonth} size="small" sx={{ backgroundColor: '#f3e8ff', '&:hover': { backgroundColor: '#e9d5ff' } }}>
              <ChevronLeft sx={{ color: '#8b5cf6' }} />
            </IconButton>
            <Typography variant="h6" fontWeight="700" sx={{ color: '#8b5cf6', minWidth: '180px', textAlign: 'center' }}>
              {format(currentMonth, 'MMMM yyyy')}
            </Typography>
            <IconButton onClick={nextMonth} size="small" sx={{ backgroundColor: '#f3e8ff', '&:hover': { backgroundColor: '#e9d5ff' } }}>
              <ChevronRight sx={{ color: '#8b5cf6' }} />
            </IconButton>
          </Box>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, newView) => newView && setView(newView)}
            size="small"
          >
            <ToggleButton value="day">
              <ViewDay fontSize="small" />
            </ToggleButton>
            <ToggleButton value="week">
              <ViewWeek fontSize="small" />
            </ToggleButton>
            <ToggleButton value="month">
              <CalendarViewMonth fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {view === 'day' && (
          <Box>
            <Box sx={{ textAlign: 'center', mb: 3, p: 2, backgroundColor: '#fef3c7', borderRadius: '12px' }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#92400e' }}>
                {format(selectedDate, 'EEEE, MMMM d')}
              </Typography>
            </Box>
            <Box>
              {getEventsForDay(selectedDate).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No events for this day 🌸
                </Typography>
              ) : (
                getEventsForDay(selectedDate).map(event => (
                  <Box
                    key={event.id}
                    sx={{
                      mb: 2,
                      p: 2,
                      borderRadius: '12px',
                      backgroundColor: event.color + '20',
                      border: `2px solid ${event.color}`,
                    }}
                  >
                    <Typography variant="body1" sx={{ fontWeight: 600, color: event.color }}>
                      {event.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {event.type}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        )}

        {view === 'week' && (
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
              {daysInWeek.map(day => (
                <Typography key={day.toISOString()} variant="caption" sx={{ textAlign: 'center', fontWeight: 600, color: 'text.secondary' }}>
                  {format(day, 'EEE')}
                </Typography>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {daysInWeek.map(day => {
                const dayEvents = getEventsForDay(day);
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentDay = isToday(day);

                return (
                  <Box
                    key={day.toISOString()}
                    onClick={() => onDateClick(day)}
                    sx={{
                      minHeight: '120px',
                      border: '2px solid',
                      borderColor: isSelected ? '#8b5cf6' : '#e9d5ff',
                      borderRadius: '12px',
                      p: 1,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#f3e8ff' : isCurrentDay ? '#fef3c7' : 'white',
                      '&:hover': {
                        backgroundColor: isSelected ? '#e9d5ff' : '#faf5ff',
                      },
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: isCurrentDay ? 700 : 600,
                        color: isCurrentDay ? '#92400e' : '#8b5cf6',
                        mb: 1,
                        textAlign: 'center',
                      }}
                    >
                      {format(day, 'd')}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, overflow: 'auto' }}>
                      {dayEvents.map(event => (
                        <Box
                          key={event.id}
                          sx={{
                            width: '100%',
                            p: 0.5,
                            borderRadius: '6px',
                            backgroundColor: event.color,
                          }}
                        >
                          <Typography variant="caption" sx={{ fontSize: '9px', color: 'white', fontWeight: 600 }}>
                            {event.title}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {view === 'month' && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Typography key={day} variant="caption" sx={{ textAlign: 'center', fontWeight: 600, color: 'text.secondary' }}>
                  {day}
                </Typography>
              ))}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {emptyDays.map((_, index) => (
                <Box key={`empty-${index}`} sx={{ aspectRatio: '1', minHeight: '60px' }} />
              ))}
              {daysInMonth.map(day => {
                const dayEvents = getEventsForDay(day);
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <Box
                    key={day.toISOString()}
                    onClick={() => onDateClick(day)}
                    sx={{
                      aspectRatio: '1',
                      minHeight: '60px',
                      border: '2px solid',
                      borderColor: isSelected ? '#8b5cf6' : '#e9d5ff',
                      borderRadius: '12px',
                      p: 0.5,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#f3e8ff' : isCurrentDay ? '#fef3c7' : 'white',
                      opacity: isCurrentMonth ? 1 : 0.5,
                      '&:hover': {
                        backgroundColor: isSelected ? '#e9d5ff' : '#faf5ff',
                      },
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: isCurrentDay ? 700 : 500,
                        color: isCurrentDay ? '#92400e' : '#8b5cf6',
                        mb: 0.5,
                      }}
                    >
                      {format(day, 'd')}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, overflow: 'hidden' }}>
                      {dayEvents.slice(0, 2).map(event => (
                        <Box
                          key={event.id}
                          sx={{
                            width: '100%',
                            height: '4px',
                            borderRadius: '2px',
                            backgroundColor: event.color,
                          }}
                        />
                      ))}
                      {dayEvents.length > 2 && (
                        <Typography variant="caption" sx={{ fontSize: '9px', color: 'text.secondary' }}>
                          +{dayEvents.length - 2}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
