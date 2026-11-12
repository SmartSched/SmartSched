import { Box, Tooltip, useMediaQuery, type Theme } from '@mui/material';
import { RateReviewOutlined } from '@mui/icons-material';
import { colors } from '../../app/theme';

export const FEEDBACK_FORM_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=2wING578lUSVNx03nMoq5zykIxgBAUdJjvJxnGoM0INUQUNTTTU5SjZaOTRUOVRSN0ZMNzBHNENHTS4u';

// Beta feedback link, pinned in the same corner as the buddy. When the buddy is showing it sits just above it;
// when the buddy is turned off it takes the buddy's spot.
export function FeedbackButton({ aboveBuddy }: { aboveBuddy: boolean }) {
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'), { noSsr: true });
  const base = isMobile ? 84 : 20;

  return (
    <Tooltip title="Give feedback" placement="left">
      <Box
        component="a"
        href={FEEDBACK_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Give feedback (opens a form in a new tab)"
        sx={{
          position: 'fixed',
          right: { xs: 12 + 14, sm: 20 + 14 },
          bottom: aboveBuddy ? base + 84 : base,
          zIndex: 1050,
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: 'background.paper',
          color: colors.accent600,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.16)' },
          '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 2 },
        }}
      >
        <RateReviewOutlined fontSize="small" />
      </Box>
    </Tooltip>
  );
}
