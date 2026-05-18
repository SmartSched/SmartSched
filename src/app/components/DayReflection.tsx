import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Box, Typography, Rating, Button, Divider } from '@mui/material';
import { format } from 'date-fns';
import { Task } from './TaskList';
import { TimeBlock } from './DailyPlanner';

interface DayReflectionProps {
  open: boolean;
  onClose: () => void;
  selectedDate: Date;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  onSubmit: (ratings: { [key: string]: number }) => void;
}

export function DayReflection({ open, onClose, selectedDate, tasks, timeBlocks, onSubmit }: DayReflectionProps) {
  const [ratings, setRatings] = useState<{ [key: string]: number }>(() => {
    const initial: { [key: string]: number } = {};
    tasks.forEach(task => {
      initial[`task-${task.id}`] = 5;
    });
    timeBlocks.forEach(block => {
      initial[`block-${block.id}`] = 5;
    });
    return initial;
  });

  const handleSubmit = () => {
    onSubmit(ratings);
    onClose();
  };

  const allItems = [
    ...tasks.map(task => ({ type: 'task', id: task.id, title: task.title, emoji: '✓' })),
    ...timeBlocks.map(block => ({ type: 'block', id: block.id, title: block.activity, emoji: getTypeEmoji(block.type) })),
  ];

  function getTypeEmoji(type: string) {
    switch (type) {
      case 'class': return '📚';
      case 'study': return '✏️';
      case 'break': return '☕';
      case 'personal': return '🌟';
      case 'commute': return '🚗';
      case 'meal': return '🍽️';
      default: return '📌';
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ backgroundColor: '#f3e8ff', color: '#7c3aed' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          day reflection 🌙
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 300, fontStyle: 'italic', mt: 0.5 }}>
          {format(selectedDate, 'EEEE, MMMM d')}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ mb: 3, fontStyle: 'italic', color: 'text.secondary' }}>
          how'd everything feel today? rate what worked for you (everything starts at 5 stars, just tap to adjust)
        </Typography>

        {allItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4, fontStyle: 'italic' }}>
            no activities to reflect on today... rest days are important too! 💜
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allItems.map((item, index) => {
              const key = `${item.type}-${item.id}`;
              return (
                <Box key={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                      <Typography sx={{ fontSize: '20px' }}>{item.emoji}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {item.title}
                      </Typography>
                    </Box>
                    <Rating
                      value={ratings[key] || 5}
                      onChange={(_, newValue) => {
                        setRatings({ ...ratings, [key]: newValue || 0 });
                      }}
                      size="small"
                      sx={{
                        '& .MuiRating-iconFilled': {
                          color: '#fbbf24',
                        },
                      }}
                    />
                  </Box>
                  {index < allItems.length - 1 && <Divider sx={{ opacity: 0.3 }} />}
                </Box>
              );
            })}
          </Box>
        )}

        <Box
          sx={{
            mt: 4,
            p: 2,
            backgroundColor: '#fef3c7',
            borderRadius: '12px',
          }}
        >
          <Typography variant="body2" sx={{ color: '#92400e', fontStyle: 'italic', fontWeight: 300, textAlign: 'center' }}>
            💛 reflecting helps you learn what works for you... there's no wrong answers here
          </Typography>
        </Box>

        <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            skip for now
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            sx={{
              backgroundColor: '#8b5cf6',
              textTransform: 'none',
              '&:hover': {
                backgroundColor: '#7c3aed',
              },
            }}
          >
            done reflecting ✨
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
