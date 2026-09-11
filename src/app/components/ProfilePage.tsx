import { ReactNode } from 'react';
import { Card, CardContent, Typography, Box, Button, Divider, Alert } from '@mui/material';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../lib/ProfileContext';
import { CalendarImage } from './SurveyPage';
import {
  COMMITMENTS,
  FOCUS_TIMES,
  WORK_SESSIONS,
  NON_NEGOTIABLES,
  DEADLINE_STYLES,
  CALENDAR_STYLES,
  labelFor,
} from '../lib/survey';

function Answer({ question, children }: { question: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {question}
      </Typography>
      <Box sx={{ typography: 'body1' }}>{children}</Box>
    </Box>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const { profile, error } = useProfile();
  const survey = profile?.survey;
  const calendar = CALENDAR_STYLES.find((c) => c.key === survey?.calendar_style);

  return (
    <Box sx={{ maxWidth: '720px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#8b5cf6' }}>
            {profile?.name || 'Your Profile'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user?.email}
          </Typography>
        </CardContent>
      </Card>

      {error && <Alert severity="error">Couldn't load your profile: {error}</Alert>}

      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Your Survey Answers
              </Typography>
              {profile?.survey_updated_at && (
                <Typography variant="body2" color="text.secondary">
                  Last updated {format(new Date(profile.survey_updated_at), 'MMMM d, yyyy')}
                </Typography>
              )}
            </Box>
            <Button component={Link} to="/survey" variant="contained" sx={{ backgroundColor: '#8b5cf6' }}>
              {survey ? 'Edit Responses' : 'Take the Survey'}
            </Button>
          </Box>

          {!survey ? (
            <Typography variant="body2" color="text.secondary">
              You haven't filled out the survey yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Divider />
              <Answer question="What's already locked into your week?">
                {COMMITMENTS.filter(({ key }) => key in survey.commitments).map(({ key, label }) => (
                  <Box key={key}>
                    {label} — {survey.commitments[key]} hrs/week
                  </Box>
                ))}
              </Answer>
              <Answer question="When do you actually focus best?">{labelFor(FOCUS_TIMES, survey.focus_time)}</Answer>
              <Answer question="How long can you work before you need a real break?">
                {labelFor(WORK_SESSIONS, survey.work_session)}
              </Answer>
              <Answer question="What has to stay in your week, even during your busiest stretch?">
                {NON_NEGOTIABLES.filter(({ key }) => survey.non_negotiables.includes(key))
                  .map(({ label }) => label)
                  .join(', ')}
              </Answer>
              <Answer question="How do you usually handle a deadline?">
                {labelFor(DEADLINE_STYLES, survey.deadline_style)}
              </Answer>
              <Answer question="The calendar that describes you best">
                {calendar ? (
                  <Box sx={{ maxWidth: '280px', mt: 0.5, borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <CalendarImage src={calendar.image} label={calendar.label} />
                    <Typography variant="body2" sx={{ p: 1 }}>
                      {calendar.label}
                    </Typography>
                  </Box>
                ) : (
                  '—'
                )}
              </Answer>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
