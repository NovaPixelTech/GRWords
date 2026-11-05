/**
 * Curated Greek vocabulary.
 *
 * Letters are derived from the polytonic spelling via `toLetters()` so every
 * note glyph is a single code point (no stray combining accents on the lyre).
 * Every word here is attested and its meaning is standard; contested folk
 * etymologies are deliberately excluded.
 */

export type TrackId = 'thalassa' | 'ouranos' | 'agape' | 'polemos' | 'sophia' | 'odysseia';

export interface WordEntry {
  id: string;
  /** Polytonic spelling, lowercase (or capitalised for proper nouns). */
  greek: string;
  translit: string;
  meaning: string;
  track: TrackId;
  /** Modern English words grown from this root, where confident. */
  kin?: string[];
  note?: string;
}

const GREEK_CAPITAL_START = 0x0391; // Α
const GREEK_CAPITAL_END = 0x03a9; // Ω

/**
 * Convert a polytonic Greek word into a clean array of uppercase Greek
 * capitals, one code point per letter. Accents, breathings, iota subscript and
 * the final sigma are all normalised away.
 */
export function toLetters(greek: string): string[] {
  const upper = greek.normalize('NFD').toUpperCase().normalize('NFD');
  const out: string[] = [];
  for (const ch of upper) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= GREEK_CAPITAL_START && code <= GREEK_CAPITAL_END) {
      out.push(ch);
    } else if (ch === '\u03C2' || ch === 'Σ') {
      out.push('Σ');
    }
  }
  return out;
}

export const WORDS: WordEntry[] = [
  // ── Θάλασσα · The Sea ────────────────────────────────────────────────
  { id: 'kyma', greek: 'κῦμα', translit: 'kŷma', meaning: 'wave', track: 'thalassa', kin: ['kymograph'] },
  { id: 'hals', greek: 'ἅλς', translit: 'háls', meaning: 'salt, the sea', track: 'thalassa', kin: ['halogen'] },
  { id: 'naus', greek: 'ναῦς', translit: 'naûs', meaning: 'ship', track: 'thalassa', kin: ['nautical', 'astronaut'] },
  { id: 'anemos', greek: 'ἄνεμος', translit: 'ánemos', meaning: 'wind', track: 'thalassa', kin: ['anemone', 'anemometer'] },
  { id: 'aphros', greek: 'ἀφρός', translit: 'aphrós', meaning: 'sea-foam', track: 'thalassa', kin: ['aphrodisiac'] },
  { id: 'delphis', greek: 'δελφίς', translit: 'delphís', meaning: 'dolphin', track: 'thalassa', kin: ['delphinium'] },
  { id: 'ichthys', greek: 'ἰχθύς', translit: 'ichthýs', meaning: 'fish', track: 'thalassa', kin: ['ichthyology'] },
  { id: 'limen', greek: 'λιμήν', translit: 'limḗn', meaning: 'harbour', track: 'thalassa' },
  { id: 'nesos', greek: 'νῆσος', translit: 'nêsos', meaning: 'island', track: 'thalassa', kin: ['Polynesia', 'Indonesia'] },
  { id: 'pontos', greek: 'πόντος', translit: 'póntos', meaning: 'the open sea', track: 'thalassa', kin: ['Pontic'] },
  { id: 'klydon', greek: 'κλύδων', translit: 'klýdōn', meaning: 'swell, surge', track: 'thalassa' },
  {
    id: 'amphitrite',
    greek: 'Ἀμφιτρίτη',
    translit: 'Amphitrítē',
    meaning: 'Amphitrite, queen of the sea',
    track: 'thalassa',
    note: 'Wife of Poseidon; her name may mean "the third one who encircles the sea".',
  },

  // ── Οὐρανός · Sky & Stars ────────────────────────────────────────────
  { id: 'aster', greek: 'ἀστήρ', translit: 'astḗr', meaning: 'star', track: 'ouranos', kin: ['asterisk', 'astronomy'] },
  { id: 'selene', greek: 'σελήνη', translit: 'selḗnē', meaning: 'moon', track: 'ouranos', kin: ['selenite', 'selenography'] },
  { id: 'helios', greek: 'ἥλιος', translit: 'hḗlios', meaning: 'sun', track: 'ouranos', kin: ['helium', 'heliotrope'] },
  { id: 'nephele', greek: 'νεφέλη', translit: 'nephélē', meaning: 'cloud', track: 'ouranos', kin: ['nebula'] },
  { id: 'keraunos', greek: 'κεραυνός', translit: 'keraunós', meaning: 'thunderbolt', track: 'ouranos', kin: ['ceraunomancy'] },
  { id: 'iris', greek: 'ἶρις', translit: 'îris', meaning: 'rainbow', track: 'ouranos', kin: ['iris', 'iridescent'] },
  { id: 'nyx', greek: 'νύξ', translit: 'nýx', meaning: 'night', track: 'ouranos', kin: ['nyctalopia'] },
  { id: 'eos', greek: 'ἕως', translit: 'héōs', meaning: 'dawn', track: 'ouranos', kin: ['eosin', 'Eocene'] },
  { id: 'zephyros', greek: 'ζέφυρος', translit: 'zéphyros', meaning: 'the west wind', track: 'ouranos', kin: ['zephyr'] },
  { id: 'ornis', greek: 'ὄρνις', translit: 'órnis', meaning: 'bird', track: 'ouranos', kin: ['ornithology'] },
  { id: 'ouranos', greek: 'οὐρανός', translit: 'ouranós', meaning: 'sky, heaven', track: 'ouranos', kin: ['Uranus', 'uranium'] },
  { id: 'astronomia', greek: 'ἀστρονομία', translit: 'astronomía', meaning: 'astronomy', track: 'ouranos', kin: ['astronomy'] },

  // ── Ἀγάπη · Love & Longing ───────────────────────────────────────────
  { id: 'eros', greek: 'ἔρως', translit: 'érōs', meaning: 'desire, love', track: 'agape', kin: ['erotic', 'Eros'] },
  { id: 'philia', greek: 'φιλία', translit: 'philía', meaning: 'friendship', track: 'agape', kin: ['philosophy', 'Philadelphia'] },
  { id: 'storge', greek: 'στοργή', translit: 'storgḗ', meaning: 'family affection', track: 'agape', kin: ['storge'] },
  { id: 'kardia', greek: 'καρδία', translit: 'kardía', meaning: 'heart', track: 'agape', kin: ['cardiac', 'cardiology'] },
  { id: 'philema', greek: 'φίλημα', translit: 'phílēma', meaning: 'a kiss', track: 'agape', kin: ['philtrum'] },
  { id: 'ankale', greek: 'ἀγκάλη', translit: 'ankálē', meaning: 'an embrace', track: 'agape' },
  { id: 'pothos', greek: 'πόθος', translit: 'póthos', meaning: 'longing', track: 'agape', kin: ['pothos'] },
  { id: 'himeros', greek: 'ἵμερος', translit: 'hímeros', meaning: 'yearning', track: 'agape' },
  { id: 'nymphe', greek: 'νύμφη', translit: 'nýmphē', meaning: 'bride, nymph', track: 'agape', kin: ['nymph'] },
  { id: 'gamos', greek: 'γάμος', translit: 'gámos', meaning: 'marriage', track: 'agape', kin: ['monogamy', 'gamete'] },
  { id: 'choros', greek: 'χορός', translit: 'chorós', meaning: 'dance, chorus', track: 'agape', kin: ['chorus', 'choir'] },
  { id: 'philostorgia', greek: 'φιλοστοργία', translit: 'philostorgía', meaning: 'tender love', track: 'agape' },

  // ── Πόλεμος · War & Glory ────────────────────────────────────────────
  { id: 'mache', greek: 'μάχη', translit: 'máchē', meaning: 'battle', track: 'polemos', kin: ['naumachia'] },
  { id: 'dory', greek: 'δόρυ', translit: 'dóry', meaning: 'spear', track: 'polemos', kin: ['Dory', 'doryphoros'] },
  { id: 'aspis', greek: 'ἀσπίς', translit: 'aspís', meaning: 'shield', track: 'polemos', kin: ['asp'] },
  { id: 'xiphos', greek: 'ξίφος', translit: 'xíphos', meaning: 'sword', track: 'polemos', kin: ['xiphoid'] },
  { id: 'nike', greek: 'νίκη', translit: 'níkē', meaning: 'victory', track: 'polemos', kin: ['Nike'] },
  { id: 'kleos', greek: 'κλέος', translit: 'kléos', meaning: 'glory, fame', track: 'polemos', kin: ['Kleos'] },
  { id: 'arete', greek: 'ἀρετή', translit: 'aretḗ', meaning: 'excellence', track: 'polemos', kin: ['arete'] },
  { id: 'tharsos', greek: 'θάρσος', translit: 'thársos', meaning: 'courage', track: 'polemos' },
  { id: 'stratos', greek: 'στρατός', translit: 'stratós', meaning: 'army', track: 'polemos', kin: ['strategy'] },
  { id: 'heros', greek: 'ἥρως', translit: 'hḗrōs', meaning: 'hero', track: 'polemos', kin: ['hero'] },
  { id: 'tropaion', greek: 'τρόπαιον', translit: 'trópaion', meaning: 'trophy of victory', track: 'polemos', kin: ['trophy'] },
  { id: 'stratelates', greek: 'στρατηλάτης', translit: 'stratēlátēs', meaning: 'army-leader', track: 'polemos' },

  // ── Σοφία · Philosophy ───────────────────────────────────────────────
  { id: 'logos', greek: 'λόγος', translit: 'lógos', meaning: 'word, reason', track: 'sophia', kin: ['logic', 'dialogue', 'biology'] },
  { id: 'aletheia', greek: 'ἀλήθεια', translit: 'alḗtheia', meaning: 'truth', track: 'sophia', kin: ['aletheia'] },
  { id: 'psyche', greek: 'ψυχή', translit: 'psychḗ', meaning: 'soul, breath', track: 'sophia', kin: ['psychology', 'psyche'] },
  { id: 'nous', greek: 'νοῦς', translit: 'noûs', meaning: 'mind, intellect', track: 'sophia', kin: ['noetic'] },
  { id: 'sophia', greek: 'σοφία', translit: 'sophía', meaning: 'wisdom', track: 'sophia', kin: ['philosophy', 'sophisticated'] },
  { id: 'gnosis', greek: 'γνῶσις', translit: 'gnôsis', meaning: 'knowledge', track: 'sophia', kin: ['diagnosis', 'agnostic'] },
  { id: 'eidos', greek: 'εἶδος', translit: 'eîdos', meaning: 'form, idea', track: 'sophia', kin: ['kaleidoscope', 'idol'] },
  { id: 'kosmos', greek: 'κόσμος', translit: 'kósmos', meaning: 'order, world', track: 'sophia', kin: ['cosmos', 'cosmetic'] },
  { id: 'atomon', greek: 'ἄτομον', translit: 'átomon', meaning: 'atom, the uncuttable', track: 'sophia', kin: ['atom'] },
  { id: 'arche', greek: 'ἀρχή', translit: 'arkhḗ', meaning: 'beginning, first principle', track: 'sophia', kin: ['archetype', 'archive'] },
  { id: 'aitia', greek: 'αἰτία', translit: 'aitía', meaning: 'cause, responsibility', track: 'sophia', kin: ['etiology'] },
  { id: 'philosophia', greek: 'φιλοσοφία', translit: 'philosophía', meaning: 'love of wisdom', track: 'sophia', kin: ['philosophy'] },

  // ── Ὀδύσσεια · The Journey ───────────────────────────────────────────
  { id: 'nostos', greek: 'νόστος', translit: 'nóstos', meaning: 'homecoming', track: 'odysseia', kin: ['nostalgia'] },
  { id: 'plane', greek: 'πλάνη', translit: 'plánē', meaning: 'wandering', track: 'odysseia', kin: ['planet'] },
  { id: 'oikos', greek: 'οἶκος', translit: 'oîkos', meaning: 'home, household', track: 'odysseia', kin: ['economy', 'ecology'] },
  { id: 'patris', greek: 'πατρίς', translit: 'patrís', meaning: 'fatherland', track: 'odysseia', kin: ['patriot'] },
  { id: 'xenos', greek: 'ξένος', translit: 'xénos', meaning: 'stranger, guest', track: 'odysseia', kin: ['xenophobia'] },
  { id: 'mythos', greek: 'μῦθος', translit: 'mŷthos', meaning: 'story, myth', track: 'odysseia', kin: ['myth', 'mythology'] },
  { id: 'mnema', greek: 'μνῆμα', translit: 'mnêma', meaning: 'memorial', track: 'odysseia', kin: ['mnemonic'] },
  { id: 'telos', greek: 'τέλος', translit: 'télos', meaning: 'end, goal', track: 'odysseia', kin: ['teleology'] },
  { id: 'ithake', greek: 'Ἰθάκη', translit: 'Ithákē', meaning: 'Ithaca, home of Odysseus', track: 'odysseia' },
  { id: 'thalassa', greek: 'θάλασσα', translit: 'thálassa', meaning: 'the sea', track: 'odysseia', kin: ['thalassemia'] },
  { id: 'nautes', greek: 'ναύτης', translit: 'naútēs', meaning: 'sailor', track: 'odysseia' },
  { id: 'odysseia', greek: 'Ὀδύσσεια', translit: 'Odýsseia', meaning: 'the Odyssey', track: 'odysseia', note: 'The long way home, told in 12,109 hexameters.' },
];

export const WORD_BY_ID: Record<string, WordEntry> = Object.fromEntries(
  WORDS.map((w) => [w.id, w]),
);

export function wordsForTrack(track: TrackId): WordEntry[] {
  return WORDS.filter((w) => w.track === track);
}

/** Pre-computed uppercase letters for every word. */
export const LETTERS: Record<string, string[]> = Object.fromEntries(
  WORDS.map((w) => [w.id, toLetters(w.greek)]),
);

export function lettersOf(id: string): string[] {
  return LETTERS[id] ?? [];
}
