/** Lecture du contenu depuis le disque (scripts Node et tests). */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RawContent } from '../src/engine/content';

export const CONTENT_DIR = join(import.meta.dirname, '..', 'content', 'sequences');

function readJson(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} : JSON invalide (${(e as Error).message}). Vérifie les virgules et les guillemets.`);
  }
}

export function readSequence(id: string): RawContent {
  const dir = join(CONTENT_DIR, id);
  const qdir = join(dir, 'questions');
  return {
    sequence: readJson(join(dir, 'sequence.json')),
    enemies: readJson(join(dir, 'enemies.json')),
    items: readJson(join(dir, 'items.json')),
    questions: readdirSync(qdir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => ({ file: `questions/${f}`, data: readJson(join(qdir, f)) })),
  };
}

export function listSequences(): string[] {
  return readdirSync(CONTENT_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
}
