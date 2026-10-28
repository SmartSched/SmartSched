// #31 The consent text testers agree to before using the app. Change CONSENT_VERSION whenever the text
// changes in a way testers should see: everyone who agreed to an older version is asked again.
export const CONSENT_VERSION = '2026-10-26';

export const CONSENT_INTRO =
  'SmartSched is a senior project. While you test it, the app stores what you put into it so it can plan ' +
  'your week, and so the planner can be improved after testing.';

export const CONSENT_SECTIONS: { heading: string; points: string[] }[] = [
  {
    heading: 'What the app stores',
    points: [
      'Your tasks, your planner blocks (including repeating ones and travel times), and your daily reflections, including bed and wake times if you add them.',
      'Your survey answers, including how much sleep you need and when you usually wake up.',
      'What you do with suggested plans: which option you choose, sessions you remove, and study blocks you move or delete.',
      'The scheduling preferences the app works out from all of the above.',
    ],
  },
  {
    heading: 'How it is used',
    points: [
      'To plan your week inside the app.',
      "After testing, to retrain and check the model that works out scheduling preferences. Your name and email aren't part of what the model learns from. Training runs on Google Colab.",
      "Only the person running this project can see your data. It isn't shared with anyone else.",
    ],
  },
  {
    heading: 'Your choices',
    points: [
      'Taking part is optional, and you can stop at any time.',
      'Delete my account and data, on your Profile page, removes your account and everything listed above straight away. This can’t be undone.',
    ],
  },
];

// Asked when the tester hasn't agreed yet, or agreed to an older version of the text.
export function needsConsent(profile: { consent_version: string | null } | null) {
  return profile?.consent_version !== CONSENT_VERSION;
}
