import { useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  IconButton,
  InputAdornment,
  Link as MuiLink,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/AuthContext';

const MIN_PASSWORD_LENGTH = 6;

export function AuthPage() {
  const [mode, setMode] = useState<'signup' | 'login' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { signUp, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();

  const passwordTooShort = mode === 'signup' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);

    if (mode === 'forgot') {
      const result = await resetPassword(email);
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Check your email for a password reset link.');
      return;
    }

    const result = mode === 'signup' ? await signUp(email, password, name) : await signIn(email, password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    navigate('/');
  };

  return (
    <Box sx={{ maxWidth: '400px', mx: 'auto', mt: 4 }}>
      <Card sx={{ borderRadius: '20px' }}>
        <CardContent sx={{ p: 4 }}>
          {mode !== 'forgot' && (
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(_, newMode) => {
                if (newMode) {
                  setMode(newMode);
                  setError(null);
                  setMessage(null);
                }
              }}
              fullWidth
              sx={{ mb: 3 }}
            >
              <ToggleButton value="login">Log In</ToggleButton>
              <ToggleButton value="signup">Sign Up</ToggleButton>
            </ToggleButtonGroup>
          )}

          {mode === 'forgot' && (
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              Reset your password
            </Typography>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {message && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'signup' && (
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            {mode !== 'forgot' && (
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                error={passwordTooShort}
                helperText={
                  mode === 'signup'
                    ? passwordTooShort
                      ? `At least ${MIN_PASSWORD_LENGTH} characters required`
                      : `Use at least ${MIN_PASSWORD_LENGTH} characters`
                    : undefined
                }
                slotProps={{
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
            )}

            {mode === 'login' && (
              <MuiLink
                component="button"
                type="button"
                variant="body2"
                sx={{ alignSelf: 'flex-end' }}
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setMessage(null);
                }}
              >
                Forgot password?
              </MuiLink>
            )}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || passwordTooShort}
              sx={{ backgroundColor: '#8b5cf6' }}
            >
              {submitting
                ? 'Please wait...'
                : mode === 'signup'
                ? 'Sign Up'
                : mode === 'forgot'
                ? 'Send Reset Link'
                : 'Log In'}
            </Button>

            {mode === 'forgot' && (
              <MuiLink
                component="button"
                type="button"
                variant="body2"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setMessage(null);
                }}
              >
                Back to log in
              </MuiLink>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
