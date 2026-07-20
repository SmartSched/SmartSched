import { useState, FormEvent } from 'react';
import { Card, CardContent, Typography, Box, TextField, Button, ToggleButton, ToggleButtonGroup, Alert } from '@mui/material';
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/AuthContext';

export function AuthPage() {
  const [mode, setMode] = useState<'signup' | 'login'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

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
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, newMode) => newMode && setMode(newMode)}
            fullWidth
            sx={{ mb: 3 }}
          >
            <ToggleButton value="login">Log In</ToggleButton>
            <ToggleButton value="signup">Sign Up</ToggleButton>
          </ToggleButtonGroup>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
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
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ backgroundColor: '#8b5cf6' }}>
              {submitting ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Log In'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
