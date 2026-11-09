import { useState } from 'react';
import { Alert, Box, ButtonBase, Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Check, DarkModeOutlined, LightModeOutlined, SettingsBrightnessOutlined } from '@mui/icons-material';
import { useAppearance, type ThemeSetting } from '../../../app/lib/AppearanceContext';
import { ACCENTS, ACCENT_LABELS, colors, resolveColors } from '../../../app/theme';

// Light, dark or follow the device, and the accent colour. Changes show at once and are saved to the account.
export function AppearanceSettings() {
  const { setting, mode, accent, setSetting, setAccent } = useAppearance();
  const [error, setError] = useState<string | null>(null);

  const save = async (change: () => Promise<void>) => {
    setError(null);
    try {
      await change();
    } catch {
      setError("Couldn't save that to your account. It applies on this device for now.");
    }
  };

  return (
    <Card>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Typography variant="h6" component="h2">
          Appearance
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }} id="theme-label">
            Theme
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={setting}
            onChange={(_, value: ThemeSetting | null) => value && save(() => setSetting(value))}
            aria-labelledby="theme-label"
            size="small"
          >
            <ToggleButton value="light" sx={{ gap: 0.75, px: 2 }}>
              <LightModeOutlined fontSize="small" /> Light
            </ToggleButton>
            <ToggleButton value="dark" sx={{ gap: 0.75, px: 2 }}>
              <DarkModeOutlined fontSize="small" /> Dark
            </ToggleButton>
            <ToggleButton value="system" sx={{ gap: 0.75, px: 2 }}>
              <SettingsBrightnessOutlined fontSize="small" /> Match device
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }} id="accent-label">
            Accent colour
          </Typography>
          <Box role="radiogroup" aria-labelledby="accent-label" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {ACCENTS.map((option) => {
              const selected = option === accent;
              // Each swatch in the shade it would actually use in the current mode.
              const swatch = resolveColors(mode, option).accent600;
              return (
                <Box key={option} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: 56 }}>
                  <ButtonBase
                    role="radio"
                    aria-checked={selected}
                    aria-label={ACCENT_LABELS[option]}
                    onClick={() => save(() => setAccent(option))}
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      backgroundColor: swatch,
                      color: colors.surface,
                      outline: selected ? `2px solid ${swatch}` : 'none',
                      outlineOffset: 3,
                      transition: 'transform 0.15s ease',
                      '&:hover': { transform: 'scale(1.08)' },
                      '&:focus-visible': { outline: `2px solid ${colors.textPrimary}`, outlineOffset: 3 },
                    }}
                  >
                    {selected && <Check fontSize="small" />}
                  </ButtonBase>
                  <Typography variant="caption" color={selected ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: selected ? 600 : 400 }}>
                    {ACCENT_LABELS[option]}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Planner block colours stay the same, so classes are always blue.
          </Typography>
        </Box>

        {error && <Alert severity="warning">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
