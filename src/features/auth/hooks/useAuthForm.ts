import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../app/lib/AuthContext';

export type AuthMode = 'signup' | 'login' | 'forgot';
export const MIN_PASSWORD_LENGTH = 6;

/** Encapsulates authentication form state and redirects, leaving AuthPage presentational. */
export function useAuthForm() {
  const [mode, setMode] = useState<AuthMode>('login');
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
  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === 'signup' && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    const result =
      mode === 'forgot'
        ? await resetPassword(email)
        : mode === 'signup'
          ? await signUp(email, password, name)
          : await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'forgot') {
      setMessage('Check your email for a password reset link.');
      return;
    }
    navigate('/');
  };

  return {
    mode, name, email, password, showPassword, error, message, submitting, passwordTooShort,
    setName, setEmail, setPassword, setShowPassword, changeMode, submit,
  };
}
