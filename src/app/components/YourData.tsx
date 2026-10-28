import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../lib/ProfileContext';

const CONFIRM_WORD = 'delete';

// #31 On the Profile page: when the tester agreed to the consent text, and deleting the account with all
// its data. Typing the word first keeps a stray click from wiping everything.
export function YourData() {
  const { deleteAccount } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      navigate('/auth', { replace: true, state: { message: 'Your account and all your data were deleted.' } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');
      setDeleting(false);
    }
  };

  return (
    <Card sx={{ borderRadius: '16px' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Your Data
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {profile?.consented_at
            ? `You agreed to take part in testing on ${format(new Date(profile.consented_at), 'MMMM d, yyyy')}.`
            : 'You agreed to take part in testing.'}{' '}
          <Box component={Link} to="/consent" sx={{ color: '#8b5cf6' }}>
            Read what's stored and how it's used
          </Box>
        </Typography>
        <Box>
          <Button variant="outlined" color="error" onClick={() => setOpen(true)}>
            Delete my account and data
          </Button>
        </Box>
      </CardContent>

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2">
            This removes your account and everything in it: tasks, planner blocks, reflections, survey answers,
            plan history and scheduling preferences. It can't be undone.
          </Typography>
          <TextField
            label={`Type "${CONFIRM_WORD}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            size="small"
            disabled={deleting}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={typed.trim().toLowerCase() !== CONFIRM_WORD || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete everything'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
