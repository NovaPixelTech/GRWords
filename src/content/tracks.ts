import type { TrackId } from './words';

export type ModeName = 'dorian' | 'phrygian' | 'lydian' | 'aeolian';

export interface Chord {
  /** Semitones above the track root. */
  root: number;
  quality: 'min' | 'maj';
}

export interface Palette {
  bg0: string;
  bg1: string;
  bg2: string;
  horizon: string;
  moon: string;
  accent: string;
  accentSoft: string;
  gold: string;
  note: string;
  danger: string;
}

export interface Track {
  id: TrackId;
  name: string;
  title: string;
  epithet: string;
  glyph: string;
  bpm: number;
  /** MIDI note of the tonic. */
  root: number;
  mode: ModeName;
  progression: Chord[];
  palette: Palette;
}

export const MODES: Record<ModeName, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

/**
 * The four lyre strings. Scale-degree indices 0, 2, 4, 6 give a seventh chord,
 * so any lane sequence the chart generator produces stays consonant.
 */
export const LANE_DEGREES = [0, 2, 4, 6];

export function laneMidi(track: Track, lane: number, octave = 1): number {
  const scale = MODES[track.mode];
  const degree = LANE_DEGREES[lane % 4];
  const oct = Math.floor(degree / scale.length);
  return track.root + scale[degree % scale.length] + 12 * (octave + oct);
}

export const TRACKS: Track[] = [
  {
    id: 'thalassa',
    name: 'Θάλασσα',
    title: 'The Sea',
    epithet: 'Salt and silver',
    glyph: '≈',
    bpm: 96,
    root: 62, // D
    mode: 'dorian',
    progression: [
      { root: 0, quality: 'min' },
      { root: 5, quality: 'maj' },
      { root: 10, quality: 'maj' },
      { root: 7, quality: 'min' },
    ],
    palette: {
      bg0: '#03070f',
      bg1: '#071c2b',
      bg2: '#0d3a44',
      horizon: '#1b6b74',
      moon: '#e9fbff',
      accent: '#63e6ff',
      accentSoft: '#a9f4ff',
      gold: '#e8c37a',
      note: '#8ff0ff',
      danger: '#ff7a6b',
    },
  },
  {
    id: 'ouranos',
    name: 'Οὐρανός',
    title: 'Sky & Stars',
    epithet: 'The vault of heaven',
    glyph: '✦',
    bpm: 88,
    root: 65, // F
    mode: 'lydian',
    progression: [
      { root: 0, quality: 'maj' },
      { root: 2, quality: 'maj' },
      { root: 9, quality: 'min' },
      { root: 7, quality: 'maj' },
    ],
    palette: {
      bg0: '#05040f',
      bg1: '#141034',
      bg2: '#28205c',
      horizon: '#4a3f8f',
      moon: '#f2ecff',
      accent: '#b18cff',
      accentSoft: '#d9c8ff',
      gold: '#f0d493',
      note: '#c9b3ff',
      danger: '#ff7a9c',
    },
  },
  {
    id: 'agape',
    name: 'Ἀγάπη',
    title: 'Love & Longing',
    epithet: 'What the heart remembers',
    glyph: '❦',
    bpm: 84,
    root: 69, // A
    mode: 'aeolian',
    progression: [
      { root: 0, quality: 'min' },
      { root: 8, quality: 'maj' },
      { root: 3, quality: 'maj' },
      { root: 10, quality: 'maj' },
    ],
    palette: {
      bg0: '#0d050b',
      bg1: '#2a0c24',
      bg2: '#4d1638',
      horizon: '#7d2a4e',
      moon: '#ffeaf3',
      accent: '#ff8fc4',
      accentSoft: '#ffc2de',
      gold: '#f3c98b',
      note: '#ffa8d2',
      danger: '#ff6b6b',
    },
  },
  {
    id: 'polemos',
    name: 'Πόλεμος',
    title: 'War & Glory',
    epithet: 'Glory is a wound that shines',
    glyph: '⚔',
    bpm: 126,
    root: 64, // E
    mode: 'phrygian',
    progression: [
      { root: 0, quality: 'min' },
      { root: 1, quality: 'maj' },
      { root: 5, quality: 'min' },
      { root: 0, quality: 'min' },
    ],
    palette: {
      bg0: '#0a0303',
      bg1: '#2b0a08',
      bg2: '#521410',
      horizon: '#8c2a17',
      moon: '#ffd9c2',
      accent: '#ff8a4c',
      accentSoft: '#ffc08f',
      gold: '#f2b96b',
      note: '#ffa96b',
      danger: '#ff4d4d',
    },
  },
  {
    id: 'sophia',
    name: 'Σοφία',
    title: 'Philosophy',
    epithet: 'The love of wisdom',
    glyph: '∴',
    bpm: 92,
    root: 67, // G
    mode: 'dorian',
    progression: [
      { root: 0, quality: 'min' },
      { root: 5, quality: 'min' },
      { root: 10, quality: 'maj' },
      { root: 3, quality: 'maj' },
    ],
    palette: {
      bg0: '#050806',
      bg1: '#0d2119',
      bg2: '#16402f',
      horizon: '#2e6b4c',
      moon: '#eafff2',
      accent: '#7ff0b8',
      accentSoft: '#b6ffd8',
      gold: '#e8c37a',
      note: '#98f5c3',
      danger: '#ff7a6b',
    },
  },
  {
    id: 'odysseia',
    name: 'Ὀδύσσεια',
    title: 'The Journey',
    epithet: 'The long way home',
    glyph: '☼',
    bpm: 104,
    root: 64, // E
    mode: 'aeolian',
    progression: [
      { root: 0, quality: 'min' },
      { root: 8, quality: 'maj' },
      { root: 3, quality: 'maj' },
      { root: 10, quality: 'maj' },
    ],
    palette: {
      bg0: '#080604',
      bg1: '#241706',
      bg2: '#462c0c',
      horizon: '#8a5a1c',
      moon: '#fff3d6',
      accent: '#ffcf70',
      accentSoft: '#ffe7b0',
      gold: '#f5cd7e',
      note: '#ffdd94',
      danger: '#ff6b53',
    },
  },
];

export const TRACK_BY_ID: Record<TrackId, Track> = Object.fromEntries(
  TRACKS.map((t) => [t.id, t]),
) as Record<TrackId, Track>;

export type Difficulty = 'mortal' | 'hero' | 'olympian';

export interface DifficultySpec {
  id: Difficulty;
  label: string;
  greek: string;
  stars: number;
  blurb: string;
}

export const DIFFICULTIES: DifficultySpec[] = [
  { id: 'mortal', label: 'Mortal', greek: 'Θνητός', stars: 1, blurb: 'One note per beat. Read the word, feel the pulse.' },
  { id: 'hero', label: 'Hero', greek: 'Ἥρως', stars: 2, blurb: 'Eighth notes, turns and ornaments. The lyre starts to sing.' },
  { id: 'olympian', label: 'Olympian', greek: 'Ὀλύμπιος', stars: 3, blurb: 'Sixteenth-note runs. Only the gods keep up.' },
];
