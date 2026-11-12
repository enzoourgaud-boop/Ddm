/** Chargement du contenu de la séquence active (empaqueté par Vite au build). */
import { parseContent, type Issue, type RawContent } from '../engine/content';
import type { Content } from '../engine/schema';

const SEQUENCE_ID = 'dia-de-muertos';

const sequences = import.meta.glob('../../content/sequences/*/sequence.json', { eager: true, import: 'default' });
const enemies = import.meta.glob('../../content/sequences/*/enemies.json', { eager: true, import: 'default' });
const items = import.meta.glob('../../content/sequences/*/items.json', { eager: true, import: 'default' });
const events = import.meta.glob('../../content/sequences/*/events.json', { eager: true, import: 'default' });
const synergies = import.meta.glob('../../content/sequences/*/synergies.json', { eager: true, import: 'default' });
const questions = import.meta.glob('../../content/sequences/*/questions/*.json', { eager: true, import: 'default' });

export function rawContent(id = SEQUENCE_ID): RawContent {
  const base = `../../content/sequences/${id}/`;
  return {
    sequence: sequences[`${base}sequence.json`],
    enemies: enemies[`${base}enemies.json`],
    items: items[`${base}items.json`],
    events: events[`${base}events.json`] ?? [],
    synergies: synergies[`${base}synergies.json`] ?? [],
    questions: Object.entries(questions)
      .filter(([k]) => k.startsWith(`${base}questions/`))
      .map(([k, data]) => ({ file: k.slice(base.length), data })),
  };
}

export function loadContent(id = SEQUENCE_ID): { content: Content | null; issues: Issue[] } {
  return parseContent(rawContent(id));
}
