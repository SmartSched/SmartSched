import { ReactNode, useState } from 'react';
import { Avatar, Card, CardContent, CircularProgress, Typography, Box, Button, Alert } from '@mui/material';
import { PhotoCameraOutlined } from '@mui/icons-material';
import { format } from 'date-fns';
import { Link } from 'react-router';
import { useAuth } from '../../../app/lib/AuthContext';
import { useProfile } from '../../../app/lib/ProfileContext';
import { CalendarImage } from '../../survey/components/SurveyPage';
import { TravelTimes } from '../../planner/components/TravelTimes';
import { YourData } from '../../planner/components/YourData';
import { AppearanceSettings } from './AppearanceSettings';
import { avatarFromFile } from '../lib/avatarImage';
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
  const { profile, error, saveAvatar } = useProfile();
  const [pictureBusy, setPictureBusy] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);

  // Shrunk to a small square in the browser first, then saved on the profile.
  const changePicture = async (file: File) => {
    setPictureError(null);
    setPictureBusy(true);
    try {
      await saveAvatar(await avatarFromFile(file));
    } catch (err) {
      setPictureError(err instanceof Error ? err.message : "Couldn't save the picture. Try again.");
    } finally {
      setPictureBusy(false);
    }
  };

  const removePicture = async () => {
    setPictureError(null);
    setPictureBusy(true);
    try {
      await saveAvatar(null);
    } catch {
      setPictureError("Couldn't remove the picture. Try again.");
    } finally {
      setPictureBusy(false);
    }
  };
  const survey = profile?.survey;
  const calendar = CALENDAR_STYLES.find((c) => c.key === survey?.calendar_style);

  return (
    <Box sx={{ maxWidth: '720px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
        <Box sx={{ position: 'relative' }}>
          <Avatar
            src={profile?.avatar ?? undefined}
            alt=""
            sx={{ width: 80, height: 80, backgroundColor: colors.accent100, color: colors.accent800, fontWeight: 700, fontSize: 28 }}
          >
            {(profile?.name || user?.email || '?').trim()[0]?.toUpperCase()}
          </Avatar>
          {pictureBusy && (
            <CircularProgress size={80} thickness={2} sx={{ position: 'absolute', inset: 0 }} aria-label="Saving picture" />
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ color: colors.accent500 }} noWrap>
            {profile?.name || 'Your profile'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {user?.email}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button component="label" size="small" variant="outlined" startIcon={<PhotoCameraOutlined />} disabled={pictureBusy}>
              {profile?.avatar ? 'Change picture' : 'Add a picture'}
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ''; // so picking the same file again still fires
                  if (file) changePicture(file);
                }}
              />
            </Button>
            {profile?.avatar && (
              <Button size="small" color="inherit" onClick={removePicture} disabled={pictureBusy} sx={{ color: 'text.secondary' }}>
                Remove
              </Button>
            )}
          </Box>
        </Box>
      </Box>
      {pictureError && <Alert severity="error">{pictureError}</Alert>}

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

      {profile && <AppearanceSettings />}

      {profile && <TravelTimes />}

      {profile && <YourData />}
    </Box>
  );
}
