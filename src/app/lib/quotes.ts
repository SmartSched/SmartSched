// Daily lines for the Home page. Written for SmartSched rather than borrowed, so they say what the
// app is about: steady effort beats sprinting, rest is part of the plan, and a good day isn't
// measured by how much got crossed off.
export const QUOTES = [
  'A steady week beats a heroic night.',
  'Rest is part of the plan, not a break from it.',
  'You don’t have to finish everything today. You just have to start.',
  'Small blocks add up. Forty-five focused minutes is a real win.',
  'Showing up tired is still showing up. Plan a lighter day and keep going.',
  'The goal isn’t a full calendar. It’s a week you can actually live.',
  'Eat the meal. Take the walk. The work will still be there, and you’ll be better at it.',
  'One thing done well beats five things half-started.',
  'Your friends, your gym time and your shift are part of your schedule, not in its way.',
  'If today didn’t go to plan, the plan can change. You don’t have to.',
  'Progress over perfection, every single day.',
  'Protect your energy the way you protect your deadlines.',
  'A break before you need one is worth two after.',
  'You’re allowed to do less today so you can keep going all semester.',
  'Check one box, then decide on the next one.',
  'A good day includes time that isn’t productive at all.',
  'Consistency is quiet. It still wins.',
  'Plan the week, then give yourself permission to live it.',
  'Hard tasks feel smaller in the hours you think best.',
  'You don’t need more hours. You need a few good ones.',
  'Leave a little room in the day. Something good might fill it.',
  'Asking for help is a study strategy too.',
  'Be proud of the effort, not just the outcome.',
];

// The same line all day and a new one each day, walking the list in order so nothing repeats until
// every line has been shown. dateIso is the user's local date (YYYY-MM-DD).
export function quoteFor(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const daysSinceEpoch = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return QUOTES[daysSinceEpoch % QUOTES.length];
}
