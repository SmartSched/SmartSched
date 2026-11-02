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
import { MIN_PASSWORD_LENGTH, useAuthForm } from '../hooks/useAuthForm';
import { colors } from '../../../app/theme';

export function AuthPage() {
  const form = useAuthForm();
  const { mode, name, email, password, showPassword, error, message, submitting, passwordTooShort } = form;

  return (
    <Box sx={{ maxWidth: '400px', mx: 'auto', mt: { xs: 2, sm: 6 } }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ color: colors.violet500 }}>
          {mode === 'signup' ? 'Make your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Classes, work, study and rest, planned together.
        </Typography>
      </Box>
      <Card sx={{ borderRadius: '20px' }}>
        <CardContent sx={{ p: 4 }}>
          {mode !== 'forgot' && (
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(_, newMode) => {
                if (newMode) {
                  form.changeMode(newMode);
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your email and we'll send you a link to set a new password.
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

          <Box component="form" onSubmit={form.submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'signup' && (
              <TextField
                label="Name"
                value={name}
                onChange={(e) => form.setName(e.target.value)}
                required
                fullWidth
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => form.setEmail(e.target.value)}
              required
              fullWidth
            />
            {mode !== 'forgot' && (
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => form.setPassword(e.target.value)}
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
                          onClick={() => form.setShowPassword(!showPassword)}
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
                  form.changeMode('forgot');
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
                  form.changeMode('login');
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
