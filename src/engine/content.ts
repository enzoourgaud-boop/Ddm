/** Validation et contrôles de cohérence du contenu, partagés par le jeu et le script `npm run valider`. */
import {
  type Content, EnemySchema, ItemSchema, QuestionSchema, SequenceSchema, type Question,
} from './schema';
import { normalize } from './answer';
import { z } from 'zod';

export interface Issue {
  level: 'erreur' | 'attention';
  where: string;
  message: string;
}

function zodIssues(where: string, err: z.ZodError): Issue[] {
  return err.issues.map(i => ({ level: 'erreur', where: `${where}${i.path.length ? ' › ' + i.path.join('.') : ''}`, message: i.message }));
}

export interface RawContent {
  sequence: unknown;
  questions: { file: string; data: unknown }[];
  enemies: unknown;
  items: unknown;
}

/** Valide le contenu brut. Les questions invalides sont écartées (le jeu reste jouable), mais signalées. */
export function parseContent(raw: RawContent): { content: Content | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const seq = SequenceSchema.safeParse(raw.sequence);
  if (!seq.success) issues.push(...zodIssues('sequence.json', seq.error));
  const enemies = z.array(EnemySchema).safeParse(raw.enemies);
  if (!enemies.success) issues.push(...zodIssues('enemies.json', enemies.error));
  const items = z.array(ItemSchema).safeParse(raw.items);
  if (!items.success) issues.push(...zodIssues('items.json', items.error));

  const questions: Question[] = [];
  for (const { file, data } of raw.questions) {
    if (!Array.isArray(data)) {
      issues.push({ level: 'erreur', where: file, message: 'le fichier doit contenir une liste [ … ]' });
      continue;
    }
    data.forEach((q, i) => {
      const r = QuestionSchema.safeParse(q);
      const id = (q && typeof q === 'object' && 'id' in q && String((q as { id: unknown }).id)) || `#${i + 1}`;
      if (r.success) questions.push(r.data);
      else issues.push(...zodIssues(`${file} › ${id}`, r.error));
    });
  }
  if (!seq.success || !enemies.success || !items.success) return { content: null, issues };
  const content: Content = { sequence: seq.data, enemies: enemies.data, items: items.data, questions };
  issues.push(...checkCoherence(content));
  return { content, issues };
}

/** Contrôles qui dépassent le schéma : doublons, références, réponses parmi les distracteurs… */
export function checkCoherence(c: Content): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, message: string) => out.push({ level: 'erreur', where, message });
  const warn = (where: string, message: string) => out.push({ level: 'attention', where, message });

  const themes = new Map(c.sequence.themes.map(t => [t.id, t]));
  const notions = new Set(c.sequence.notions.map(n => n.id));
  const sources = new Set(c.sequence.sources.map(s => s.id));
  const enemies = new Map(c.enemies.map(e => [e.id, e]));
  const items = new Set(c.items.map(i => i.id));

  // questions
  const ids = new Map<string, number>();
  const prompts = new Map<string, string>();
  for (const q of c.questions) {
    const w = `question ${q.id}`;
    ids.set(q.id, (ids.get(q.id) ?? 0) + 1);
    const key = normalize(`${q.label ?? ''} ${q.prompt}`);
    const prev = prompts.get(key);
    if (prev && prev !== q.id) err(w, `même énoncé que la question ${prev}`);
    else prompts.set(key, q.id);

    const theme = themes.get(q.theme);
    if (!theme) err(w, `thème inconnu « ${q.theme} »`);
    for (const n of q.notions) if (!notions.has(n)) err(w, `notion inconnue « ${n} » (à déclarer dans sequence.json)`);
    if (!sources.has(q.source)) err(w, `source inconnue « ${q.source} » (à déclarer dans sequence.json)`);

    const goods = [q.answer, ...q.accept].map(normalize);
    const ds = q.distractors.map(normalize);
    ds.forEach((d, i) => {
      if (goods.includes(d)) err(w, `le distracteur « ${q.distractors[i]} » est une bonne réponse`);
      if (ds.indexOf(d) !== i) err(w, `le distracteur « ${q.distractors[i]} » apparaît deux fois`);
    });
    if (q.prompt.includes('___')) {
      const holes = q.prompt.split('___').length - 1;
      const parts = q.answer.split(' / ').length;
      if (holes !== parts) err(w, `${holes} trou(s) ___ dans l'énoncé mais ${parts} partie(s) dans la réponse (séparer par « / »)`);
    }
    if (q.promptLang === 'es' && !q.translation && !theme?.translationOptional) warn(w, 'traduction manquante (le Traductor sera inutilisable)');
  }
  for (const [id, n] of ids) if (n > 1) err(`question ${id}`, `identifiant utilisé ${n} fois`);

  // quantités minimales pour que le jeu tourne
  for (const t of c.sequence.themes) {
    for (const l of [1, 2, 3] as const) {
      const n = c.questions.filter(q => q.theme === t.id && q.level === l && !q.disabled).length;
      if (n === 0) warn(`thème ${t.id}`, `aucune question de niveau ${l}`);
    }
  }
  if (!c.questions.some(q => q.level === 'jefe')) warn('banque', 'aucune question de niveau « jefe »');

  // ennemis et actes
  const cards = new Map<number, string>();
  for (const e of c.enemies) {
    const o = cards.get(e.card);
    if (o) err(`ennemi ${e.id}`, `numéro de carte ${e.card} déjà pris par ${o}`);
    cards.set(e.card, e.id);
    for (const p of e.phases ?? []) for (const t of p.themes ?? []) if (!themes.has(t)) err(`ennemi ${e.id}`, `thème inconnu « ${t} » dans la phase ${p.name}`);
  }
  for (const a of c.sequence.acts) {
    for (const id of [...a.enemies, ...a.elites, a.boss]) if (!enemies.has(id)) err(`acte ${a.id}`, `ennemi inconnu « ${id} »`);
    for (const id of a.elites) if (enemies.get(id) && enemies.get(id)!.kind !== 'elite') err(`acte ${a.id}`, `« ${id} » n'est pas un élite`);
  }
  for (const id of Object.keys(c.sequence.player.startItems)) if (!items.has(id)) err('sequence.json › player.startItems', `objet inconnu « ${id} »`);
  return out;
}
