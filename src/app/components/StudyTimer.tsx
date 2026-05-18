import { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Button, Box, LinearProgress, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { PlayArrow, Pause, Refresh, Coffee } from '@mui/icons-material';

interface StudyTimerProps {
  onSessionComplete: (duration: number, type: 'study' | 'break') => void;
}

export function StudyTimer({ onSessionComplete }: StudyTimerProps) {
  const [mode, setMode] = useState<'study' | 'break'>('study');
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setTimeLeft(duration * 60);
  }, [duration]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            onSessionComplete(duration, mode);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeLeft, duration, mode, onSessionComplete]);

  const handleModeChange = (_: React.MouseEvent<HTMLElement>, newMode: 'study' | 'break' | null) => {
    if (newMode !== null) {
      setMode(newMode);
      setIsRunning(false);
      setDuration(newMode === 'study' ? 25 : 5);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(duration * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = ((duration * 60 - timeLeft) / (duration * 60)) * 100;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" fontWeight="600">
            Pomodoro Timer
          </Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={handleModeChange}
            size="small"
          >
            <ToggleButton value="study">
              Study
            </ToggleButton>
            <ToggleButton value="break">
              Break
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h2" fontWeight="600" sx={{ fontSize: '72px', fontFamily: 'monospace' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 8,
              borderRadius: 4,
              mt: 2,
              backgroundColor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                backgroundColor: mode === 'study' ? 'primary.main' : 'success.main',
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => setIsRunning(!isRunning)}
            startIcon={isRunning ? <Pause /> : <PlayArrow />}
            sx={{ flex: 1 }}
          >
            {isRunning ? 'Pause' : 'Start'}
          </Button>
          <IconButton onClick={handleReset} size="large">
            <Refresh />
          </IconButton>
        </Box>

        <Box sx={{ mt: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Session Length
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {mode === 'study' ? (
              <>
                <Button
                  variant={duration === 15 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(15)}
                  sx={{ flex: 1 }}
                >
                  15 min
                </Button>
                <Button
                  variant={duration === 25 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(25)}
                  sx={{ flex: 1 }}
                >
                  25 min
                </Button>
                <Button
                  variant={duration === 45 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(45)}
                  sx={{ flex: 1 }}
                >
                  45 min
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={duration === 5 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(5)}
                  sx={{ flex: 1 }}
                >
                  5 min
                </Button>
                <Button
                  variant={duration === 10 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(10)}
                  sx={{ flex: 1 }}
                >
                  10 min
                </Button>
                <Button
                  variant={duration === 15 ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setDuration(15)}
                  sx={{ flex: 1 }}
                >
                  15 min
                </Button>
              </>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
