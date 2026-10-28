import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, needsConsent } from './consent';

describe('needsConsent', () => {
  it('asks when there is no profile or no consent yet', () => {
    expect(needsConsent(null)).toBe(true);
    expect(needsConsent({ consent_version: null })).toBe(true);
  });

  it('asks again after the text changes', () => {
    expect(needsConsent({ consent_version: '2000-01-01' })).toBe(true);
  });

  it("doesn't ask once the current version is agreed to", () => {
    expect(needsConsent({ consent_version: CONSENT_VERSION })).toBe(false);
  });
});
