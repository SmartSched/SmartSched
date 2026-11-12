import { Box, useMediaQuery, type Theme } from '@mui/material';
import { RateReviewOutlined } from '@mui/icons-material';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { colors } from '../../app/theme';

export const FEEDBACK_FORM_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=2wING578lUSVNx03nMoq5zykIxgBAUdJjvJxnGoM0INUQUNTTTU5SjZaOTRUOVRSN0ZMNzBHNENHTS4u';

const SIZE = 60;
const BUDDY_W = 72;

// Beta feedback link, pinned in the same corner as the buddy. When the buddy is showing it sits just above it;
// when the buddy is turned off it takes the buddy's spot. It breathes and wobbles like the buddy does, and a small
// speech bubble to its left says what it is.
export function FeedbackButton({ aboveBuddy }: { aboveBuddy: boolean }) {
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'), { noSsr: true });
  const reduceMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const base = isMobile ? 84 : 20;
  const inset = (BUDDY_W - SIZE) / 2; // centre it over the buddy

  const jiggle = () => {
    if (reduceMotion || !scope.current) return;
    animate(
      scope.current,
      { scaleX: [1, 1.18, 0.9, 1.06, 1], scaleY: [1, 0.84, 1.1, 0.96, 1], rotate: [0, -6, 5, -2, 0] },
      { duration: 0.55, ease: 'easeOut' },
    );
  };

  return (
    <Box
      component="a"
      href={FEEDBACK_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Give feedback (opens a form in a new tab)"
      onPointerEnter={jiggle}
      onPointerDown={jiggle}
      sx={{
        position: 'fixed',
        right: { xs: 12 + inset, sm: 20 + inset },
        bottom: aboveBuddy ? base + 84 : base,
        zIndex: 1050,
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        WebkitTapHighlightColor: 'transparent',
        '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 3 },
        '@keyframes feedbackBreathe': { from: { transform: 'scaleY(1)' }, to: { transform: 'scaleY(1.04) scaleX(0.985)' } },
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          right: SIZE + 10,
          top: '50%',
          transform: 'translateY(-50%)',
          px: 1.25,
          py: 0.5,
          borderRadius: '10px',
          whiteSpace: 'nowrap',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.4,
          color: colors.accent600,
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          // The tail, pointing at the button.
          '&::after': {
            content: '""',
            position: 'absolute',
            right: -5,
            top: '50%',
            width: 8,
            height: 8,
            backgroundColor: 'inherit',
            borderTop: '1px solid',
            borderRight: '1px solid',
            borderColor: 'inherit',
            transform: 'translateY(-50%) rotate(45deg)',
          },
        }}
      >
        Feedback
      </Box>
      <motion.div
        ref={scope}
        whileHover={reduceMotion ? undefined : { y: -3 }}
        style={{ width: '100%', height: '100%', transformOrigin: '50% 100%' }}
      >
        <Box
          sx={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'background.paper',
            color: colors.accent600,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            transformOrigin: '50% 100%',
            animation: reduceMotion ? 'none' : 'feedbackBreathe 1.7s ease-in-out infinite alternate',
          }}
        >
          <RateReviewOutlined sx={{ fontSize: 28 }} />
        </Box>
      </motion.div>
    </Box>
  );
}
