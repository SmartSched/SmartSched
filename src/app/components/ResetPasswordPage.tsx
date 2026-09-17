import { useEffect, useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/AuthContext';

const MIN_PASSWORD_LENGTH = 6;

function getHashError(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const description = params.get('error_description');

  return description ? description.replace(/\+/g, ' ') : params.get('error');
}

export function ResetPasswordPage() {
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const { updatePassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLinkError(getHashError());
  }, []);

  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError(`Password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);

    const result = await updatePassword(password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    navigate('/');
  };

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    setResendMessage(null);

    if (!resendEmail.trim()) return;

    setResending(true);

    const result = await resetPassword(resendEmail.trim());

    setResending(false);
    setResendMessage(result.error ?? 'Check your email for a new reset link.');
  };

  if (linkError) {
    return (
      <Box sx={{ maxWidth: '400px', mx: 'auto', mt: 4 }}>
        <Card sx={{ borderRadius: '20px' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              This link is no longer valid
            </Typography>

            <Alert severity="error" sx={{ mb: 3 }}>
              {linkError}
            </Alert>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Password reset links expire quickly and can only be used once.
              Enter your email below to get a new one.
            </Typography>

            <Box
              component="form"
              onSubmit={handleResend}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                label="Email"
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                fullWidth
              />

              {resendMessage && (
                <Alert severity={resendMessage.includes('Check your email') ? 'success' : 'error'}>
                  {resendMessage}
                </Alert>
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={resending}
                sx={{ backgroundColor: '#8b5cf6' }}
              >
                {resending ? 'Sending...' : 'Send New Reset Link'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '400px', mx: 'auto', mt: 4 }}>
      <Card sx={{ borderRadius: '20px' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
            Choose a new password
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText={
                password.length === 0
                  ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
                  : passwordValid
                  ? 'Password meets the requirement'
                  : `At least ${MIN_PASSWORD_LENGTH} characters required`
              }
              slotProps={{
                formHelperText: {
                  sx: {
                    color:
                      password.length === 0
                        ? 'text.secondary'
                        : passwordValid
                        ? '#10b981'
                        : '#dc2626',
                    fontWeight: 500,
                  },
                },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((prev) => !prev)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || !passwordValid}
              sx={{ backgroundColor: '#8b5cf6' }}
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
