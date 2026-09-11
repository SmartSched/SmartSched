import { useState, FormEvent, ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardActionArea,
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
  EMPTY_SURVEY,
  SurveyAnswers,
} from '../lib/survey';

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
          backgroundColor: '#f3f4f6',
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
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkedCommitments = Object.entries(commitmentHours) as [CommitmentKey, string][];
  const commitmentsValid =
    checkedCommitments.length > 0 &&
    checkedCommitments.every(([, hours]) => Number(hours) > 0 && Number(hours) <= 168);

  const answered = [
    commitmentsValid,
    !!answers.focus_time,
    !!answers.work_session,
    answers.non_negotiables.length > 0,
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const missing = answered.map((ok, i) => (ok ? null : i + 1)).filter((n) => n !== null);
    if (missing.length > 0) {
      setError(
        !commitmentsValid && checkedCommitments.length > 0
          ? 'Add rough weekly hours (up to 168) for each commitment you checked in question 1.'
          : `Please answer question${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`,
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

  return (
    <Box sx={{ maxWidth: '720px', mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#8b5cf6', mb: 1 }}>
          {isEditing ? 'Edit your survey' : "Let's get to know your week"}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {isEditing
            ? 'Update anything that has changed.'
            : 'A few quick questions so your schedule fits how you actually live. You can change these any time from your profile.'}
        </Typography>
      </Box>

      <Box sx={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'white', py: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {answeredCount} of {answered.length} answered
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(answeredCount / answered.length) * 100}
          sx={{ height: 8, borderRadius: 4, backgroundColor: '#f3e8ff' }}
        />
      </Box>

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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

        <Question number={5} title="Be honest, how do you usually handle a deadline?">
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

        <Question number={6} title="Choose the calendar that describes you best.">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {CALENDAR_STYLES.map(({ key, label, image }) => {
              const selected = answers.calendar_style === key;
              return (
                <Card
                  key={key}
                  sx={{
                    borderRadius: '12px',
                    border: selected ? '3px solid #8b5cf6' : '3px solid transparent',
                    outline: selected ? 'none' : '1px solid #e5e7eb',
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
        </Question>

        {error && <Alert severity="error">{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mb: 4 }}>
          {isEditing && (
            <Button onClick={() => navigate('/profile')} disabled={submitting} sx={{ color: '#8b5cf6' }}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ backgroundColor: '#8b5cf6' }}>
            {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Finish'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
