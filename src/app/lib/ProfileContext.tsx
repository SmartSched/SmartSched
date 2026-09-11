import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { apiGet, apiPut } from './api';
import type { SurveyAnswers } from './survey';

export interface Profile {
  id: string;
  name: string | null;
  survey: SurveyAnswers | null;
  survey_updated_at: string | null;
}

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  saveSurvey: (survey: SurveyAnswers) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Tagging the loaded profile with its user id means "loading" is true the moment a
  // different user logs in, before the effect below has had a chance to run.
  const [state, setState] = useState<{ userId: string | null; profile: Profile | null; error: string | null }>({
    userId: null,
    profile: null,
    error: null,
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGet('/api/profile')
      .then((profile) => !cancelled && setState({ userId: user.id, profile, error: null }))
      .catch((err) => !cancelled && setState({ userId: user.id, profile: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const loading = !!user && state.userId !== user.id;

  const saveSurvey = async (survey: SurveyAnswers) => {
    const profile = await apiPut('/api/profile/survey', { survey });
    setState({ userId: profile.id, profile, error: null });
  };

  return (
    <ProfileContext.Provider
      value={{ profile: user ? state.profile : null, loading, error: state.error, saveSurvey }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
