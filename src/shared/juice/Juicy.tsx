import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Checkbox, type CheckboxProps } from '@mui/material';
import { keyframes } from '@emotion/react';
import { CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material';
import { burst, rememberPoint } from './burst';
import { emitJuice } from './events';
import { playChime, playTick } from './sound';
import { colors } from '../../app/theme';

const squish = keyframes`
  0% { transform: scale(1, 1); }
  30% { transform: scale(1.25, 0.75); }
  55% { transform: scale(0.85, 1.15); }
  75% { transform: scale(1.06, 0.96); }
  100% { transform: scale(1, 1); }
`;

const pop = keyframes`
  0% { transform: scale(0.6); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
`;

// A checkbox that squishes when pressed and pops (with a soft tick) when its task actually becomes done.
// Checking off usually opens the "how long did it take" dialog first, so the pop waits for `checked` to flip.
export function JuicyCheckbox(props: CheckboxProps) {
  const { checked, onClick, sx, ...rest } = props;
  const [pressKey, setPressKey] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const wasChecked = useRef(checked);

  useEffect(() => {
    if (checked && !wasChecked.current) {
      setPopKey((k) => k + 1);
      playTick();
      emitJuice('task-done');
    }
    wasChecked.current = checked;
  }, [checked]);

  return (
    <Checkbox
      {...rest}
      checked={checked}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        rememberPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        setPressKey((k) => k + 1);
        onClick?.(e);
      }}
      sx={[
        {
          '& .MuiSvgIcon-root': {
            animation: pressKey ? `${squish} 0.38s ease-out` : 'none',
          },
          '&.Mui-checked .MuiSvgIcon-root': {
            animation: popKey ? `${pop} 0.32s cubic-bezier(.3,1.6,.5,1)` : 'none',
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      // Re-keying the icon restarts its animation on every press.
      icon={<CheckBoxOutlineBlank key={`u${pressKey}`} />}
      checkedIcon={<CheckBox key={`c${popKey}`} />}
    />
  );
}

// A title that gets an ink line drawn through it, left to right (and line by line when it wraps), when done.
export function InkText({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        backgroundImage: 'linear-gradient(currentColor, currentColor)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 58%',
        backgroundSize: done ? '100% 2px' : '0% 2px',
        color: done ? colors.grey500 : 'inherit',
        transition: done
          ? 'background-size 0.35s cubic-bezier(.6,.1,.3,1), color 0.3s ease 0.25s'
          : 'background-size 0.2s ease, color 0.2s ease',
      }}
    >
      {children}
    </Box>
  );
}

// The quiet celebration for finishing the last thing in a group.
export function celebrate() {
  burst();
  playChime();
  emitJuice('cleared');
}

// Keeps just-finished items on screen for a moment so the ink line and pop can play before they move away.
export function useLinger(ms = 1100) {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const linger = useCallback(
    (id: string) => {
      setIds((current) => new Set(current).add(id));
      window.setTimeout(() => {
        setIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, ms);
    },
    [ms],
  );
  return { lingering: ids, linger };
}
