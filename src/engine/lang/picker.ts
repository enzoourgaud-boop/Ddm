/**
 * Choix des questions dans la banque : thème, niveau, variété, questions voisines évitées,
 * mode de réponse (QCM, écrit, plateau…). Rien ici ne connaît le combat.
 */
import { isChoice, isWritable, fixedMode, orderTokens, questionWords, type Mode, TF_OPTIONS } from '../questions';
import type { Rng } from '../rng';
import { type Content, levelNum, type Question, type QuestionType } from '../schema';
import { type Asked, RECENT_WINDOW, type RunState, type Settings, TYPE_WEIGHT } from '../core/types';

export interface PickOpts {
  themes: string[];
  level: 1 | 2 | 3 | 4;
  needWrite: boolean;
  weakTheme?: string | null;
  onlyType?: QuestionType;
}

/** Ce que le sélecteur a besoin de lire ou de modifier dans la partie. */
export interface PickerCtx {
  rng: Rng;
  settings(): Settings;
  state(): RunState;
}

export class Picker {
  private words: Map<string, { all: Set<string>; answer: Set<string> }>;
  /** Poids de tirage d'une question (révision de Leitner). */
  weightOf: (q: Question) => number = () => 1;

  constructor(readonly content: Content, private ctx: PickerCtx) {
    // mots importants de chaque question, sans les mots trop fréquents dans la banque
    const raw = new Map(content.questions.map(q => [q.id, questionWords(q)]));
    const df = new Map<string, number>();
    for (const w of raw.values()) for (const x of w.all) df.set(x, (df.get(x) ?? 0) + 1);
    const tooCommon = Math.max(12, content.questions.length * 0.06);
    const keep = (set: Set<string>) => new Set([...set].filter(x => (df.get(x) ?? 0) <= tooCommon));
    this.words = new Map([...raw].map(([id, w]) => [id, { all: keep(w.all), answer: keep(w.answer) }]));
  }

  /** Deux questions sont « trop proches » si elles partagent 2 mots importants, ou si la réponse de l'une est dans l'autre. */
  closeTo(a: string, b: string): boolean {
    if (a === b) return true;
    const A = this.words.get(a), B = this.words.get(b);
    if (!A || !B) return false;
    let shared = 0;
    for (const w of A.all) if (B.all.has(w)) shared++;
    if (shared >= 2) return true;
    for (const w of A.answer) if (B.all.has(w)) return true;
    for (const w of B.answer) if (A.all.has(w)) return true;
    return false;
  }

  /** La question ressemble-t-elle à l'une des dernières posées ? */
  clashes(id: string, window = RECENT_WINDOW): boolean {
    const r = this.ctx.state().recent ?? [];
    return r.slice(-window).some(x => this.closeTo(id, x));
  }

  /** Thèmes jouables (réglages ∩ séquence). */
  activeThemes(): string[] {
    const all = this.content.sequence.themes.map(t => t.id);
    const on = this.ctx.settings().themes;
    const kept = on ? all.filter(t => on.includes(t)) : all;
    return kept.length ? kept : all;
  }

  isUsable(q: Question): boolean {
    if (q.disabled) return false;
    const types = this.ctx.settings().types;
    if (types && !types.includes(q.type)) return false;
    return true;
  }

  canWrite(q: Question): boolean {
    return this.ctx.settings().writeFactor > 0 && isWritable(q);
  }

  pick(o: PickOpts): Question {
    const s = this.ctx.state(), rng = this.ctx.rng;
    const ok = (q: Question) => this.isUsable(q) && (!o.needWrite || isWritable(q)) && (!o.onlyType || q.type === o.onlyType);
    const order = [o.level, ...[4, 3, 2, 1].filter(l => l < o.level), ...[1, 2, 3, 4].filter(l => l > o.level)];
    const candidatesFor = (theme: string): Question[] => {
      for (const l of order) {
        const pool = this.content.questions.filter(q => q.theme === theme && levelNum(q.level) === l && ok(q));
        if (pool.length) return pool;
      }
      return [];
    };
    const withPool = o.themes.map(t => ({ t, pool: candidatesFor(t) })).filter(x => x.pool.length);
    if (!withPool.length && o.onlyType) return this.pick({ ...o, onlyType: undefined });
    if (!withPool.length) {
      const any = this.content.questions.filter(q => this.isUsable(q));
      return rng.pick(any.length ? any : this.content.questions);
    }
    // pour chaque thème : questions pas encore vues, puis sans ressemblance avec les dernières posées
    const refine = (pool: Question[]) => {
      const fresh = pool.filter(q => !s.seen[q.id]);
      const base = fresh.length ? fresh : pool;
      return { base, far: base.filter(q => !this.clashes(q.id)) };
    };
    let chosen = rng.pick(withPool);
    if (o.weakTheme && rng.chance(0.4)) chosen = withPool.find(x => x.t === o.weakTheme) ?? chosen;
    let { base, far } = refine(chosen.pool);
    if (!far.length) {
      // ce thème n'a plus que des questions trop proches : on essaie un autre thème
      const other = rng.shuffle(withPool).map(x => refine(x.pool)).find(x => x.far.length);
      if (other) ({ base, far } = other);
    }
    const pool = far.length ? far : base;
    return rng.weighted(pool, q => this.weightOf(q) * (TYPE_WEIGHT[q.type] ?? 1));
  }

  /** Prépare la question posée : options mélangées, mémorisation dans « vues » et « récentes ». */
  makeAsked(q: Question, mode: Mode, again = false): Asked {
    const s = this.ctx.state(), rng = this.ctx.rng;
    s.seen[q.id] = (s.seen[q.id] ?? 0) + 1;
    s.recent = [...(s.recent ?? []), q.id].slice(-12);
    let options: string[] = [];
    if (mode === 'qcm' && isChoice(q)) options = rng.shuffle([q.answer, ...rng.shuffle(q.distractors).slice(0, 3)]);
    else if (mode === 'tf') options = [...TF_OPTIONS];
    else if (mode === 'order' && q.type === 'ordre') {
      const toks = [...orderTokens(q), ...q.extra];
      options = rng.shuffle(toks);
      for (let k = 0; k < 5 && options.join(' ') === orderTokens(q).join(' '); k++) options = rng.shuffle(toks);
    } else if (mode === 'match' && q.type === 'association') options = rng.shuffle(q.pairs.map(p => p[1]));
    else if (mode === 'place' && q.type === 'scene') options = rng.shuffle(q.scene.items.map(it => it.object));
    return { id: q.id, mode, options, again: again || undefined };
  }

  /** Mode de réponse : imposé par le type, sinon QCM ou écrit. */
  chooseMode(q: Question, writeP: number, forceWrite = false): Mode {
    const fm = fixedMode(q);
    if (fm && fm !== 'write') return fm;
    if (!this.canWrite(q)) return 'qcm';
    if (fm === 'write' || forceWrite) return 'write';
    return this.ctx.rng.chance(writeP) ? 'write' : 'qcm';
  }
}
