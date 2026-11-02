import { useState, FormEvent, ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardActionArea,
  ButtonBase,
  Typography,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  LinearProgress,
  Alert,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router';
import { useProfile } from '../lib/ProfileContext';
import {
  COMMITMENTS,
  FOCUS_TIMES,
  WORK_SESSIONS,
  NON_NEGOTIABLES,
  DEADLINE_STYLES,
  CALENDAR_STYLES,
  SLEEP_HOURS,
  WAKE_TIME,
  EMPTY_SURVEY,
  SurveyAnswers,
} from '../lib/survey';
import { colors } from '../theme';

type CommitmentKey = (typeof COMMITMENTS)[number]['key'];
type NonNegotiableKey = (typeof NON_NEGOTIABLES)[number]['key'];

export function CalendarImage({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Box
        sx={{
          aspectRatio: '9 / 10',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">{label}</Typography>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={label}
      onError={() => setFailed(true)}
      sx={{ width: '100%', height: 'auto', display: 'block' }}
    />
  );
}

function Question({ number, title, hint, children }: { number: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card sx={{ borderRadius: '16px' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: hint ? 0.5 : 2 }}>
          {number}. {title}
        </Typography>
        {hint && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {hint}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function SurveyPage() {
  const { profile, saveSurvey } = useProfile();
  const navigate = useNavigate();
  const initial = profile?.survey ?? EMPTY_SURVEY;
  const isEditing = !!profile?.survey;

  // Hours are kept as the raw input text so the field can be blank while typing;
  // a commitment is "checked" when its key is present.
  const [commitmentHours, setCommitmentHours] = useState<Partial<Record<CommitmentKey, string>>>(
    Object.fromEntries(Object.entries(initial.commitments).map(([key, hours]) => [key, String(hours)])),
  );
  const [answers, setAnswers] = useState<Omit<SurveyAnswers, 'commitments'>>({
    focus_time: initial.focus_time,
    work_session: initial.work_session,
    non_negotiables: initial.non_negotiables,
    deadline_style: initial.deadline_style,
    calendar_style: initial.calendar_style,
    sleep_hours: initial.sleep_hours ?? null,
    wake_time: initial.wake_time ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);

  const checkedCommitments = Object.entries(commitmentHours) as [CommitmentKey, string][];
  const commitmentsValid =
    checkedCommitments.length > 0 &&
    checkedCommitments.every(([, hours]) => Number(hours) > 0 && Number(hours) <= 168);

  const wakeTimeValid =
    !!answers.wake_time && answers.wake_time >= WAKE_TIME.earliest && answers.wake_time <= WAKE_TIME.latest;

  const answered = [
    commitmentsValid,
    !!answers.focus_time,
    !!answers.work_session,
    answers.non_negotiables.length > 0,
    answers.sleep_hours != null && wakeTimeValid,
    !!answers.deadline_style,
    !!answers.calendar_style,
  ];
  const answeredCount = answered.filter(Boolean).length;

  const toggleCommitment = (key: CommitmentKey) => {
    const next = { ...commitmentHours };
    if (key in next) delete next[key];
    else next[key] = '';
    setCommitmentHours(next);
  };

  const toggleNonNegotiable = (key: NonNegotiableKey) => {
    const current = answers.non_negotiables;
    setAnswers({
      ...answers,
      non_negotiables: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    });
  };

  // The message for a question that isn't answered well enough to move on.
  const stepError = (index: number) => {
    if (index === 0 && checkedCommitments.length > 0 && !commitmentsValid)
      return 'Add rough weekly hours (up to 168) for each commitment you checked.';
    if (index === 4 && answers.wake_time && !wakeTimeValid) return 'Pick a wake-up time between 4:00 AM and noon.';
    return 'Answer this question to go on.';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Enter or Next on any question but the last moves forward.
    if (step < answered.length - 1) {
      if (!answered[step]) {
        setError(stepError(step));
        return;
      }
      setError(null);
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const missing = answered.map((ok, i) => (ok ? null : i + 1)).filter((n) => n !== null);
    if (missing.length > 0) {
      setError(
        !commitmentsValid && checkedCommitments.length > 0
          ? 'Add rough weekly hours (up to 168) for each commitment you checked in question 1.'
          : answers.wake_time && !wakeTimeValid
            ? 'Pick a wake-up time between 4:00 AM and noon in question 5.'
            : `Please answer question${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. Use the numbers above to go back.`,
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await saveSurvey({
        ...answers,
        commitments: Object.fromEntries(checkedCommitments.map(([key, hours]) => [key, Number(hours)])),
      });
      navigate(isEditing ? '/profile' : '/');
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const questions = [
        <Question
          number={1}
          title="What's already locked into your week?"
          hint="Select all that apply, with rough hours per week."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {COMMITMENTS.map(({ key, label }) => {
              const checked = key in commitmentHours;
              return (
                <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <FormControlLabel
                    control={<Checkbox checked={checked} onChange={() => toggleCommitment(key)} />}
                    label={label}
                    sx={{ flex: 1, minWidth: '240px' }}
                  />
                  {checked && (
                    <TextField
                      size="small"
                      type="number"
                      label="Hours / week"
                      value={commitmentHours[key]}
                      onChange={(e) => setCommitmentHours({ ...commitmentHours, [key]: e.target.value })}
                      slotProps={{ htmlInput: { min: 1, max: 168, step: 0.5 } }}
                      sx={{ width: '140px' }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Question>
,
        <Question number={2} title="When do you actually focus best?">
          <RadioGroup
            value={answers.focus_time ?? ''}
            onChange={(e) => setAnswers({ ...answers, focus_time: e.target.value as SurveyAnswers['focus_time'] })}
          >
            {FOCUS_TIMES.map(({ key, label }) => (
              <FormControlLabel key={key} value={key} control={<Radio />} label={label} />
            ))}
          </RadioGroup>
        </Question>
,
        <Question number={3} title="How long can you work before you need a real break?">
          <RadioGroup
            value={answers.work_session ?? ''}
            onChange={(e) => setAnswers({ ...answers, work_session: e.target.value as SurveyAnswers['work_session'] })}
          >
            {WORK_SESSIONS.map(({ key, label }) => (
              <FormControlLabel key={key} value={key} control={<Radio />} label={label} />
            ))}
          </RadioGroup>
        </Question>
,
        <Question
          number={4}
          title="What has to stay in your week, even during your busiest stretch?"
          hint="Select all that apply."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {NON_NEGOTIABLES.map(({ key, label }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={answers.non_negotiables.includes(key)}
                    onChange={() => toggleNonNegotiable(key)}
                  />
                }
                label={label}
              />
            ))}
          </Box>
        </Question>
,
        <Question
          number={5}
          title="How much sleep do you need, and when do you usually wake up?"
          hint="Your plans keep study out of your sleep, the hour before bed, and the 45 minutes after you wake up."
        >
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              label="Sleep a night"
              value={answers.sleep_hours ?? ''}
              onChange={(e) => setAnswers({ ...answers, sleep_hours: Number(e.target.value) })}
              sx={{ width: '180px' }}
            >
              {SLEEP_HOURS.map((hours) => (
                <MenuItem key={hours} value={hours}>
                  {hours} hours
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="time"
              label="Usual wake-up time"
              value={answers.wake_time ?? ''}
              onChange={(e) => setAnswers({ ...answers, wake_time: e.target.value || null })}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: WAKE_TIME.earliest, max: WAKE_TIME.latest, step: 900 },
              }}
              sx={{ width: '180px' }}
            />
          </Box>
        </Question>
,
        <Question number={6} title="Be honest, how do you usually handle a deadline?">
          <RadioGroup
            value={answers.deadline_style ?? ''}
            onChange={(e) =>
              setAnswers({ ...answers, deadline_style: e.target.value as SurveyAnswers['deadline_style'] })
            }
          >
            {DEADLINE_STYLES.map(({ key, label }) => (
              <FormControlLabel key={key} value={key} control={<Radio />} label={label} />
            ))}
          </RadioGroup>
        </Question>
,
        <Question number={7} title="Choose the calendar that describes you best.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {CALENDAR_STYLES.map(({ key, label, image }) => {
              const selected = answers.calendar_style === key;
              return (
                <Card
                  key={key}
                  sx={{
                    borderRadius: '12px',
                    border: selected ? `3px solid ${colors.violet500}` : '3px solid transparent',
                    outline: selected ? 'none' : `1px solid ${colors.grey200}`,
                  }}
                >
                  <CardActionArea
                    onClick={() => setAnswers({ ...answers, calendar_style: key })}
                    aria-pressed={selected}
                  >
                    <CalendarImage src={image} label={label} />
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Radio checked={selected} size="small" sx={{ p: 0 }} tabIndex={-1} />
                      <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
                        {label}
                      </Typography>
                    </Box>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        </Question>,
  ];

  const last = questions.length - 1;
  const goTo = (index: number) => {
    setError(null);
    setStep(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Box sx={{ maxWidth: '720px', mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ color: colors.violet500, mb: 1, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
          {isEditing ? 'Edit your survey' : "Let's get to know your week"}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {isEditing
            ? 'Update anything that has changed.'
            : 'A few quick questions so your schedule fits how you actually live. You can change these any time from your profile.'}
        </Typography>
      </Box>

      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: colors.violet800 }}>
            Question {step + 1} of {questions.length}
          </Typography>
          <Box component="nav" aria-label="Survey questions" sx={{ display: 'flex', gap: 0.75 }}>
            {questions.map((_, i) => (
              <ButtonBase
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Question ${i + 1}${answered[i] ? ', answered' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  fontSize: 12,
                  fontWeight: 700,
                  border: `1px solid ${i === step ? colors.violet600 : answered[i] ? colors.violet200 : colors.grey200}`,
                  backgroundColor: i === step ? colors.violet600 : answered[i] ? colors.violet100 : colors.surface,
                  color: i === step ? colors.surface : answered[i] ? colors.violet800 : 'text.secondary',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {i + 1}
              </ButtonBase>
            ))}
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(answeredCount / answered.length) * 100}
          aria-label={`${answeredCount} of ${answered.length} answered`}
          sx={{ height: 8, borderRadius: 4, backgroundColor: colors.violet100, '& .MuiLinearProgress-bar': { backgroundColor: colors.violet400 } }}
        />
      </Box>

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box key={step} sx={{ animation: 'pageIn 0.2s ease-out' }}>
          {questions[step]}
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 4, flexWrap: 'wrap' }}>
          {isEditing && (
            <Button onClick={() => navigate('/profile')} disabled={submitting} sx={{ color: colors.violet600 }}>
              Cancel
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" onClick={() => goTo(step - 1)} disabled={step === 0 || submitting}>
            Back
          </Button>
          {step < last ? (
            <Button type="submit" variant="contained" size="large">
              Next
            </Button>
          ) : (
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Finish'}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
