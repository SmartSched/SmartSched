import { useState } from 'react';
import { Card, CardContent, Typography, Box, Button, Checkbox, FormControlLabel, Alert } from '@mui/material';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../lib/ProfileContext';
import { CONSENT_INTRO, CONSENT_SECTIONS, needsConsent } from '../lib/consent';

// #31 Shown before anything else after logging in, until the tester agrees to the current text. Once they
// have, the Profile page links back here to read it again.
export function ConsentPage() {
  const { signOut } = useAuth();
  const { profile, saveConsent } = useProfile();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asking = needsConsent(profile);

  const handleAgree = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveConsent();
      navigate(profile?.survey ? '/' : '/survey', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: '720px', mx: 'auto' }}>
      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#8b5cf6' }}>
              Taking part in testing
            </Typography>
            {!asking && profile?.consented_at && (
              <Typography variant="body2" color="text.secondary">
                You agreed on {format(new Date(profile.consented_at), 'MMMM d, yyyy')}.
              </Typography>
            )}
          </Box>

          <Typography variant="body1">{CONSENT_INTRO}</Typography>

          {CONSENT_SECTIONS.map((section) => (
            <Box key={section.heading}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                {section.heading}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {section.points.map((point) => (
                  <Typography component="li" variant="body2" key={point}>
                    {point}
                  </Typography>
                ))}
              </Box>
            </Box>
          ))}

          {error && <Alert severity="error">{error}</Alert>}

          {asking ? (
            <>
              <FormControlLabel
                control={<Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />}
                label="I've read this and agree to take part."
              />
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  disabled={!agreed || saving}
                  onClick={handleAgree}
                  sx={{ backgroundColor: '#8b5cf6' }}
                >
                  Continue
                </Button>
                <Button
                  onClick={async () => {
                    await signOut();
                    navigate('/auth');
                  }}
                  sx={{ color: '#6b7280' }}
                >
                  Log out
                </Button>
              </Box>
            </>
          ) : (
            <Box>
              <Button component={Link} to="/profile" variant="outlined">
                Back to your profile
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
