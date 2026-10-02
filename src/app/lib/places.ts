// Places a block can be at, and travel times between them. Keys and names match server/validation.js.

export const BUILT_IN_PLACES = ['home', 'campus', 'work', 'gym'];

export interface Travel {
  places: string[]; // the user's own places, lowercase
  minutes: Record<string, number>; // "campus|work" -> 20, names in sorted order
}

export const EMPTY_TRAVEL: Travel = { places: [], minutes: {} };

export function placeLabel(place: string) {
  return place.charAt(0).toUpperCase() + place.slice(1);
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

export function allPlaces(travel: Travel | null | undefined) {
  return [...BUILT_IN_PLACES, ...(travel?.places ?? [])];
}

// Every pair of places once, in a stable order: [["home", "campus"], ["home", "work"], ...].
export function placePairs(places: string[]) {
  const pairs: [string, string][] = [];
  places.forEach((a, i) => places.slice(i + 1).forEach((b) => pairs.push([a, b])));
  return pairs;
}
