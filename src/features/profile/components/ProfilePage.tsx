import { ReactNode } from 'react';
import { Avatar, Card, CardContent, Typography, Box, Button, Alert } from '@mui/material';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { useAuth } from '../../../app/lib/AuthContext';
import { useProfile } from '../../../app/lib/ProfileContext';
import { CalendarImage } from '../../survey/components/SurveyPage';
import { TravelTimes } from '../../planner/components/TravelTimes';
import { YourData } from '../../planner/components/YourData';
import {
  COMMITMENTS,
  FOCUS_TIMES,
  WORK_SESSIONS,
  NON_NEGOTIABLES,
  DEADLINE_STYLES,
  CALENDAR_STYLES,
  formatWakeTime,
  labelFor,
} from '../../../app/lib/survey';
import { colors } from '../../../app/theme';

function Answer({ question, children, wide }: { question: string; children: ReactNode; wide?: boolean }) {
  return (
    <Box sx={{ gridColumn: wide ? '1 / -1' : undefined }}>
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ width: 56, height: 56, backgroundColor: colors.violet100, color: colors.violet800, fontWeight: 700, fontSize: 20 }}>
          {(profile?.name || user?.email || '?').trim()[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ color: colors.violet500 }} noWrap>
            {profile?.name || 'Your profile'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user?.email}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error">Couldn't load your profile: {error}</Alert>}

      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6" component="h2">
                How you like to plan
              </Typography>
              {profile?.survey_updated_at && (
                <Typography variant="body2" color="text.secondary">
                  Last updated {format(new Date(profile.survey_updated_at), 'MMMM d, yyyy')}
                </Typography>
              )}
            </Box>
            <Button component={Link} to="/survey" variant={survey ? 'outlined' : 'contained'}>
              {survey ? 'Edit answers' : 'Take the survey'}
            </Button>
          </Box>

          {!survey ? (
            <Typography variant="body2" color="text.secondary">
              You haven't filled out the survey yet.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, pt: 2, borderTop: `1px solid ${colors.grey200}` }}>
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
              <Answer question="How much sleep do you need, and when do you usually wake up?">
                {survey.sleep_hours != null && survey.wake_time
                  ? `${survey.sleep_hours} hours, up around ${formatWakeTime(survey.wake_time)}`
                  : 'Not answered yet. Edit your responses to add it.'}
              </Answer>
              <Answer question="How do you usually handle a deadline?">
                {labelFor(DEADLINE_STYLES, survey.deadline_style)}
              </Answer>
              <Answer question="The calendar that describes you best" wide>
                {calendar ? (
                  <Box sx={{ maxWidth: '280px', mt: 0.5, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${colors.grey200}` }}>
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

      {profile && <TravelTimes />}

      {profile && <YourData />}
    </Box>
  );
}
