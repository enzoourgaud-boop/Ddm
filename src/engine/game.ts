/**
 * Moteur de partie : état sérialisable + actions. Aucun accès au DOM.
 * L'interface appelle les actions (answer, usePower, proceed…) puis relit `state`.
 */
import { type AccentPolicy, autoHint, checkAnswer, fillBlanks, maskAnswer, normalize, type Verdict } from './answer';
import { Rng } from './rng';
import {
  type Act, type Content, type Enemy, type Intent, type Item, type Phase, type Question, type Rarity, type Trait, levelNum,
} from './schema';

/* ======================= Types ======================= */

export interface Settings {
  /** Thèmes actifs (null = tous). */
  themes: string[] | null;
  /** Types de questions actifs (null = tous). */
  types: string[] | null;
  chrono: boolean;
  /** Multiplie la durée du chrono (1 = normal). */
  chronoFactor: number;
  /** Multiplie la part de réponses écrites (0 = jamais d'écrit, 1 = normal, 2 = double). */
  writeFactor: number;
  accents: AccentPolicy;
}

export const DEFAULT_SETTINGS: Settings = {
  themes: null, types: null, chrono: true, chronoFactor: 1, writeFactor: 1, accents: 'casi',
};

export type Mode = 'qcm' | 'write';

export interface Asked {
  id: string;
  mode: Mode;
  options: string[];
  again?: boolean;
}

export type Outcome = Verdict | 'timeout' | 'oracle';

export interface Feedback {
  outcome: Outcome;
  title: string;
  given: string | null;
  lines: string[];
  alert?: string;
  dmgToEnemy: number;
  dmgToPlayer: number;
  combo?: number;
}

export interface CombatState {
  enemyId: string;
  hp: number;
  maxHp: number;
  shield: number;
  abanico: number;
  phase: number;
  turn: number;
  intent: Intent;
  /** Bonus d'attaque (crescendo, phases). */
  attackBonus: number;
  weakTheme: string | null;
  juicio: boolean;
  vanishUsed: boolean;
  rowCorrect: number;
  fog: boolean;
  q: Asked;
  fb: Feedback | null;
  used: { translate?: boolean; hint?: boolean; scissors?: boolean };
  hidden: string[];
  mask: string;
  timeMax: number;
  timeLeft: number;
}

export interface ErrorEntry {
  id: string;
  prompt: string;
  answer: string;
  explanation: string;
  given: string | null;
}

export interface Offer {
  id: string;
  sold?: boolean;
}

export type Screen = 'combat' | 'reward' | 'shop' | 'over';

export interface RunState {
  v: 1;
  seed: string;
  rng: number;
  screen: Screen;
  hp: number;
  maxHp: number;
  gold: number;
  act: number;
  room: number;
  /** Enchaînement des ennemis par acte (étape 1 : chemin linéaire). */
  rooms: string[][];
  inv: Record<string, number>;
  relics: Record<string, number>;
  streak: number;
  poison: number;
  stats: { ok: number; ko: number; casi: number; won: number; written: number; turns: number; startedAt: number; endedAt: number };
  seen: Record<string, number>;
  retry: string[];
  errors: ErrorEntry[];
  combat: CombatState | null;
  offer: Offer[] | null;
  offerKind: 'normal' | 'elite' | null;
  result: 'win' | 'lose' | null;
}

const RARITY_WEIGHT: Record<Rarity, number> = { comun: 60, rara: 30, legendaria: 10 };

/* ======================= Moteur ======================= */

export class Game {
  readonly content: Content;
  settings: Settings;
  state: RunState;
  private rng: Rng;
  private qById: Map<string, Question>;
  private enemyById: Map<string, Enemy>;
  private itemById: Map<string, Item>;
  private listeners = new Set<() => void>();
  /** Poids de tirage d'une question (branché sur Leitner à l'étape 4). */
  weightOf: (q: Question) => number = () => 1;

  constructor(content: Content, settings: Settings, state: RunState) {
    this.content = content;
    this.settings = settings;
    this.state = state;
    this.rng = new Rng(state.rng);
    this.qById = new Map(content.questions.map(q => [q.id, q]));
    this.enemyById = new Map(content.enemies.map(e => [e.id, e]));
    this.itemById = new Map(content.items.map(i => [i.id, i]));
  }

  /** Démarre une nouvelle partie à partir d'une graine. */
  static newRun(content: Content, settings: Settings, seed: string, now = Date.now()): Game {
    const rng = new Rng(seed);
    const rooms = content.sequence.acts.map(a => {
      const normals = rng.shuffle(a.enemies);
      const n = [normals[0], normals[1 % normals.length]];
      return [...n, rng.pick(a.elites), a.boss];
    });
    const p = content.sequence.player;
    const state: RunState = {
      v: 1, seed, rng: rng.state, screen: 'combat', hp: p.hp, maxHp: p.hp, gold: 0, act: 0, room: 0, rooms,
      inv: { ...p.startItems }, relics: {}, streak: 0, poison: 0,
      stats: { ok: 0, ko: 0, casi: 0, won: 0, written: 0, turns: 0, startedAt: now, endedAt: 0 },
      seen: {}, retry: [], errors: [], combat: null, offer: null, offerKind: null, result: null,
    };
    const g = new Game(content, settings, state);
    g.startFight();
    g.commit();
    return g;
  }

  /* ---------- abonnements ---------- */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private commit() {
    this.state.rng = this.rng.state;
    this.listeners.forEach(f => f());
  }

  /* ---------- accès ---------- */
  get act(): Act {
    return this.content.sequence.acts[this.state.act];
  }
  get enemy(): Enemy | null {
    return this.state.combat ? this.enemyById.get(this.state.combat.enemyId)! : null;
  }
  get phase(): Phase | null {
    const c = this.state.combat, e = this.enemy;
    return c && e?.phases ? e.phases[c.phase] : null;
  }
  get question(): Question | null {
    return this.state.combat ? this.qById.get(this.state.combat.q.id) ?? null : null;
  }
  item(id: string): Item | undefined {
    return this.itemById.get(id);
  }
  getQuestion(id: string): Question | undefined {
    return this.qById.get(id);
  }
  enemyDef(id: string): Enemy | undefined {
    return this.enemyById.get(id);
  }
  relicCount(effect: Item['effect']): number {
    let n = 0;
    for (const [id, k] of Object.entries(this.state.relics)) if (this.itemById.get(id)?.effect === effect) n += k;
    return n;
  }
  relicValue(effect: Item['effect']): number {
    let n = 0;
    for (const [id, k] of Object.entries(this.state.relics)) {
      const it = this.itemById.get(id);
      if (it?.effect === effect) n += k * (it.value ?? 1);
    }
    return n;
  }
  traits(): Set<Trait> {
    const e = this.enemy;
    return new Set([...(e?.traits ?? []), ...(this.phase?.traits ?? [])]);
  }
  get streakThreshold(): number {
    return this.relicCount('streakMaster') ? 2 : 3;
  }
  /** Les pouvoirs sont-ils utilisables maintenant ? Renvoie la raison sinon. */
  powerBlock(id: string): string | null {
    const s = this.state, c = s.combat, it = this.itemById.get(id), q = this.question;
    if (!it || !(s.inv[id] > 0)) return 'non possédé';
    if (it.auto) return 'automatique';
    if (it.effect === 'heal') return s.hp >= s.maxHp ? 'vie pleine' : null;
    if (s.screen !== 'combat' || !c || c.fb || !q) return 'hors combat';
    if (c.fog) return 'brouillard';
    if (this.enemy?.modifier === 'niebla' && (it.effect === 'translate' || it.effect === 'hint')) return 'niebla';
    switch (it.effect) {
      case 'translate': return !q.translation ? 'pas de traduction' : c.used.translate ? 'déjà utilisé' : null;
      case 'hint': return c.used.hint ? 'déjà utilisé' : null;
      case 'scissors': return c.used.scissors ? 'déjà utilisé' : null;
      case 'time': return c.timeMax ? null : 'pas de chrono';
      default: return null;
    }
  }

  /* ======================= Combat ======================= */

  private startFight() {
    const s = this.state;
    const e = this.enemyById.get(s.rooms[s.act][s.room])!;
    s.screen = 'combat';
    s.offer = null;
    s.offerKind = null;
    s.poison = 0;
    const abanico = e.phases?.[0]?.abanico ?? 0;
    s.combat = {
      enemyId: e.id, hp: e.hp, maxHp: e.hp, shield: 0, abanico: this.settings.writeFactor > 0 ? abanico : 0,
      phase: 0, turn: 0, intent: { kind: 'attack' }, attackBonus: e.phases?.[0]?.attackBonus ?? 0, weakTheme: null, juicio: false,
      vanishUsed: false, rowCorrect: 0, fog: false, q: { id: '', mode: 'qcm', options: [] }, fb: null, used: {}, hidden: [], mask: '',
      timeMax: 0, timeLeft: 0,
    };
    this.nextTurn();
  }

  private rollIntent(): Intent {
    const c = this.state.combat!, e = this.enemy!;
    const list = this.phase?.intents ?? e.intents;
    let it: Intent;
    if (e.pattern === 'cycle') it = list[(c.turn - 1) % list.length];
    else {
      const prev = c.intent;
      const pool = list.filter(x => x.kind === 'attack' || x.kind !== prev.kind);
      it = this.rng.pick(pool.length ? pool : list);
    }
    if (it.kind === 'rush' && !this.settings.chrono) it = { kind: 'attack' };
    return { ...it };
  }

  private nextTurn() {
    const s = this.state, c = s.combat!;
    c.turn++;
    s.stats.turns++;
    c.intent = this.rollIntent();
    const tr = this.traits();
    c.fog = c.intent.kind === 'fog';
    c.juicio = tr.has('juicio') && c.turn % 3 === 0;
    c.weakTheme = tr.has('colorShift') ? this.rng.pick(this.activeThemes()) : null;
    if (c.intent.kind === 'shield') c.shield += c.intent.value ?? 2;
    this.ask();
  }

  /** Thèmes jouables (réglages ∩ séquence). */
  activeThemes(): string[] {
    const all = this.content.sequence.themes.map(t => t.id);
    const on = this.settings.themes ? all.filter(t => this.settings.themes!.includes(t)) : all;
    return on.length ? on : all;
  }

  private isUsable(q: Question): boolean {
    if (q.disabled) return false;
    if (this.settings.types && !this.settings.types.includes(q.type)) return false;
    return true;
  }

  private needsWrite(): boolean {
    return this.enemy?.modifier === 'soloEscrito' && this.settings.writeFactor > 0;
  }

  private targetLevel(): 1 | 2 | 3 | 4 {
    const e = this.enemy!, ph = this.phase;
    if (ph?.levels?.length) return levelNum(this.rng.pick(ph.levels));
    if (e.kind === 'final') return this.rng.chance(0.4) ? 4 : 3;
    const L = this.act.level;
    if (e.kind !== 'normal') return L;
    return L === 1 || this.rng.chance(0.65) ? L : ((L - 1) as 1 | 2);
  }

  /** Choisit la prochaine question selon l'ennemi, la phase, les réglages et l'historique. */
  private pickQuestion(): Question {
    const s = this.state, c = s.combat!, e = this.enemy!, ph = this.phase;
    let themes = this.activeThemes();
    if (ph?.themes) {
      const t = themes.filter(x => ph.themes!.includes(x));
      if (t.length) themes = t;
    }
    if (c.juicio && e.focusTheme && themes.includes(e.focusTheme)) themes = [e.focusTheme];
    const write = this.needsWrite();
    const ok = (q: Question) => this.isUsable(q) && (!write || q.type === 'ecrit' || q.writable);
    const L = this.targetLevel();
    const order = [L, ...[4, 3, 2, 1].filter(l => l < L), ...[1, 2, 3, 4].filter(l => l > L)];

    const candidatesFor = (theme: string): Question[] => {
      for (const l of order) {
        const pool = this.content.questions.filter(q => q.theme === theme && levelNum(q.level) === l && ok(q));
        if (pool.length) return pool;
      }
      return [];
    };
    const withPool = themes.map(t => ({ t, pool: candidatesFor(t) })).filter(x => x.pool.length);
    if (!withPool.length) {
      const any = this.content.questions.filter(q => this.isUsable(q));
      return this.rng.pick(any.length ? any : this.content.questions);
    }
    let chosen = this.rng.pick(withPool);
    if (c.weakTheme && this.rng.chance(0.4)) chosen = withPool.find(x => x.t === c.weakTheme) ?? chosen;
    const fresh = chosen.pool.filter(q => !s.seen[q.id]);
    const pool = fresh.length ? fresh : chosen.pool;
    return this.rng.weighted(pool, q => this.weightOf(q));
  }

  private modeFor(q: Question): Mode {
    const e = this.enemy!, tr = this.traits();
    if (this.settings.writeFactor <= 0) return 'qcm';
    if (q.type === 'ecrit') return 'write';
    if (!q.writable) return 'qcm';
    if (this.needsWrite()) return 'write';
    let p = this.act.writeShare + (e.kind === 'jefe' ? 0.1 : 0);
    if (e.kind === 'final') p = 0.5;
    if (tr.has('abanico')) p = 0.75;
    p = Math.min(1, p * this.settings.writeFactor);
    return this.rng.chance(p) ? 'write' : 'qcm';
  }

  private ask(forceNew = false) {
    const s = this.state, c = s.combat!, e = this.enemy!;
    let q: Question | undefined;
    let again = false;
    if (!forceNew && s.retry.length > 1 && e.kind !== 'final' && !c.juicio && this.rng.chance(0.3)) {
      const id = s.retry.shift()!;
      q = this.qById.get(id);
      again = !!q;
    }
    if (!q || !this.isUsable(q)) {
      q = this.pickQuestion();
      again = false;
    }
    s.seen[q.id] = (s.seen[q.id] ?? 0) + 1;
    const mode = this.modeFor(q);
    const options = mode === 'qcm' ? this.rng.shuffle([q.answer, ...this.rng.shuffle(q.distractors).slice(0, 3)]) : [];
    c.q = { id: q.id, mode, options, again: again || undefined };
    c.fb = null;
    c.used = {};
    c.hidden = [];
    c.mask = '';
    // chrono
    if (!this.settings.chrono) {
      c.timeMax = c.timeLeft = 0;
    } else {
      let sec = this.traits().has('ultimoBaile') ? 15 : this.act.chrono;
      if (mode === 'write') sec += 10;
      if (e.modifier === 'prisa') sec *= 0.5;
      sec *= this.settings.chronoFactor;
      if (c.intent.kind === 'rush') sec -= c.intent.value ?? 5;
      sec = Math.max(6, Math.round(sec));
      c.timeMax = c.timeLeft = sec * 1000;
    }
  }

  /** Avance le chrono. Renvoie true si l'état a changé (fin du temps). */
  tick(ms: number): boolean {
    const c = this.state.combat;
    if (this.state.screen !== 'combat' || !c || c.fb || !c.timeMax) return false;
    c.timeLeft = Math.max(0, c.timeLeft - ms);
    if (c.timeLeft <= 0) {
      this.answer(null, 'timeout');
      return true;
    }
    return false;
  }

  private checkOptions(q: Question) {
    const theme = this.content.sequence.themes.find(t => t.id === q.theme);
    return {
      ignoreArticles: q.check?.ignoreArticles ?? theme?.check?.ignoreArticles ?? false,
      optionalSubject: q.check?.optionalSubject ?? theme?.check?.optionalSubject ?? true,
      accents: this.relicCount('accentForgive') ? ('accept' as const) : this.settings.accents,
    };
  }

  /** Juge une réponse sans rien modifier (utile pour l'interface et les tests). */
  judge(value: string): Verdict | null {
    const c = this.state.combat, q = this.question;
    if (!c || !q) return null;
    if (c.q.mode === 'qcm') return normalize(value) === normalize(q.answer) ? 'ok' : 'ko';
    return checkAnswer(value, [q.answer, ...q.accept], this.checkOptions(q));
  }

  /** Répond à la question en cours. how = 'timeout' ou 'oracle' pour les cas spéciaux. */
  answer(value: string | null, how: 'normal' | 'timeout' | 'oracle' = 'normal'): Feedback | null {
    const s = this.state, c = s.combat, q = this.question, e = this.enemy;
    if (s.screen !== 'combat' || !c || !q || !e || c.fb) return null;
    let v: Verdict;
    if (how === 'oracle') v = 'ok';
    else if (how === 'timeout') v = 'ko';
    else {
      const j = this.judge(value ?? '');
      if (!j) return null;
      v = j;
    }
    const seq = this.content.sequence;
    const fb: Feedback = {
      outcome: how === 'normal' ? v : how, title: '', given: value, lines: [], dmgToEnemy: 0, dmgToPlayer: 0,
    };
    const tr = this.traits();

    if (v === 'ok') {
      let dmg = 1 + this.relicValue('damageBonus');
      if (how !== 'oracle') {
        s.streak++;
        s.stats.ok++;
        c.rowCorrect++;
        s.retry = s.retry.filter(id => id !== q.id);
        if (c.q.mode === 'write') {
          s.stats.written++;
          dmg += 1 + this.relicValue('writeBonus');
        }
        const th = this.streakThreshold;
        if (s.streak >= th) {
          dmg += th === 2 ? 2 : 1;
          fb.combo = s.streak;
        }
        if (c.weakTheme === q.theme) {
          dmg += 2;
          fb.lines.push(`${e.name} est vulnérable à ce thème : +2 dégâts.`);
        }
        if (tr.has('ultimoBaile') && s.streak >= 3) {
          dmg *= 2;
          fb.lines.push('Série de 3 : la Catrina titube, dégâts doublés !');
        }
      }
      if (tr.has('vanish') && !c.vanishUsed) {
        c.vanishUsed = true;
        dmg = 0;
        fb.lines.push(`${e.name} disparaît : ton coup passe à travers ! La prochaine fois, ça touchera.`);
      }
      if (dmg > 0 && c.abanico > 0) {
        if (c.q.mode === 'write' || how === 'oracle') {
          const a = Math.min(c.abanico, dmg);
          c.abanico -= a;
          dmg -= a;
          fb.lines.push(c.abanico > 0 ? `L'abanico se déchire (${c.abanico} restant).` : "L'abanico est brisé !");
        } else {
          dmg = 0;
          fb.lines.push("L'abanico bloque les réponses en QCM : écris pour le briser !");
        }
      }
      if (dmg > 0 && c.shield > 0) {
        const a = Math.min(c.shield, dmg);
        c.shield -= a;
        dmg -= a;
        fb.lines.push(`Le bouclier absorbe ${a} dégât${a > 1 ? 's' : ''}.`);
      }
      c.hp = Math.max(0, c.hp - dmg);
      fb.dmgToEnemy = dmg;
      const gold = 1 + this.relicValue('goldPerCorrect');
      s.gold += gold;
      fb.title = how === 'oracle' ? seq.feedback.oracle : this.rng.pick(seq.feedback.ok);
      fb.lines.unshift(`${e.name} perd ${dmg} PV${fb.combo ? ` (série de ${fb.combo})` : ''}${c.q.mode === 'write' && how !== 'oracle' ? ', réponse écrite : dégâts renforcés' : ''}. +${gold} 🪙`);
    } else if (v === 'casi') {
      s.stats.casi++;
      fb.title = seq.feedback.casi;
      fb.lines.push("Il manque un accent (ou un tilde). Personne n'est blessé, ta série continue.");
      this.logError(q, value);
    } else {
      s.stats.ko++;
      s.streak = 0;
      c.rowCorrect = 0;
      fb.title = how === 'timeout' ? seq.feedback.timeout : this.rng.pick(seq.feedback.ko);
      if (how === 'timeout') fb.lines.push('Le temps est écoulé : cela compte comme une erreur.');
      this.logError(q, value);
      if (!s.retry.includes(q.id)) s.retry.push(q.id);
      this.enemyStrikes(fb);
      if (tr.has('vanidad') && c.hp > 0) {
        c.hp = Math.min(c.maxHp, c.hp + 1);
        fb.lines.push(`${e.name} admire son reflet et récupère 1 PV.`);
      }
    }

    // fin de tour
    if (c.hp > 0) {
      if (c.intent.kind === 'heal') {
        const h = Math.min(c.maxHp - c.hp, c.intent.value ?? 2);
        if (h > 0) {
          c.hp += h;
          fb.lines.push(`${e.name} se soigne de ${h} PV.`);
        }
      }
      if (tr.has('crescendo')) {
        if (c.rowCorrect >= 2) {
          if (c.attackBonus > 0) fb.lines.push('Deux bonnes réponses de suite : la musique se calme.');
          c.attackBonus = 0;
          c.rowCorrect = 0;
        } else c.attackBonus = Math.min(4, c.attackBonus + 1);
      }
    }
    if (s.poison > 0 && s.hp > 0) {
      s.hp = Math.max(0, s.hp - 1);
      s.poison--;
      fb.dmgToPlayer += 1;
      fb.lines.push(`Le poison te fait perdre 1 PV (${s.poison} restant${s.poison > 1 ? 's' : ''}).`);
    }
    // changement de phase
    if (e.phases && c.hp > 0) {
      let p = c.phase;
      while (p + 1 < e.phases.length && c.hp / c.maxHp <= e.phases[p + 1].from) p++;
      if (p !== c.phase) {
        c.phase = p;
        const ph = e.phases[p];
        c.abanico = this.settings.writeFactor > 0 ? ph.abanico ?? 0 : 0;
        c.attackBonus = ph.attackBonus;
        fb.alert = `${ph.name} — ${ph.message}`;
      }
    }
    c.fb = fb;
    this.commit();
    return fb;
  }

  private enemyStrikes(fb: Feedback) {
    const s = this.state, c = s.combat!, e = this.enemy!, it = c.intent;
    let dmg = (it.kind === 'attack' ? it.value ?? e.attack : e.attack) + c.attackBonus;
    if (c.juicio) {
      dmg *= 2;
      fb.lines.push('Juicio : la sentence est doublée !');
    }
    const shieldId = Object.keys(s.inv).find(id => s.inv[id] > 0 && this.itemById.get(id)?.effect === 'autoShield');
    if (shieldId) {
      s.inv[shieldId]--;
      fb.lines.push(`Ton ${this.itemById.get(shieldId)!.name} bloque l'attaque de ${e.name}.`);
    } else {
      s.hp = Math.max(0, s.hp - dmg);
      fb.dmgToPlayer += dmg;
      fb.lines.push(`${e.name} t'inflige ${dmg} dégât${dmg > 1 ? 's' : ''}.`);
    }
    if (it.kind === 'steal' && s.gold > 0) {
      const g = Math.min(s.gold, it.value ?? 2);
      s.gold -= g;
      fb.lines.push(`${e.name} te vole ${g} 🪙.`);
    }
    if (it.kind === 'stealItem') {
      const owned = Object.keys(s.inv).filter(id => s.inv[id] > 0);
      if (owned.length) {
        const id = this.rng.pick(owned);
        s.inv[id]--;
        fb.lines.push(`${e.name} te vole un pouvoir : ${this.itemById.get(id)?.name ?? id}.`);
      }
    }
    if (it.kind === 'poison') {
      s.poison += it.value ?? 3;
      fb.lines.push(`Tu es empoisonné : −1 PV par question pendant ${s.poison} questions.`);
    }
  }

  private logError(q: Question, given: string | null) {
    const s = this.state;
    if (s.errors.some(e => e.id === q.id)) return;
    s.errors.push({
      id: q.id,
      prompt: `${q.label ? q.label + ' · ' : ''}${q.prompt}`,
      answer: fillBlanks(q.prompt, q.answer),
      explanation: q.explanation,
      given,
    });
  }

  /** Passe à la suite après le retour (feedback). */
  proceed() {
    const s = this.state, c = s.combat;
    if (s.screen !== 'combat' || !c || !c.fb) return;
    if (s.hp <= 0) return this.end(false);
    if (c.hp <= 0) return this.winFight();
    this.nextTurn();
    this.commit();
  }

  private winFight() {
    const s = this.state, e = this.enemy!;
    s.stats.won++;
    s.gold += e.kind === 'normal' ? 3 : e.kind === 'elite' ? 5 : 6;
    const h = this.relicValue('healAfterFight');
    if (h) s.hp = Math.min(s.maxHp, s.hp + h);
    s.poison = 0;
    if (e.kind === 'final') return this.end(true);
    if (e.kind === 'jefe') {
      s.hp = Math.min(s.maxHp, s.hp + 3);
      const aides = this.rng.shuffle(this.available('aide')).slice(0, 2);
      const rel = this.rng.shuffle(this.available('reliquia')).slice(0, 2);
      s.offer = [...aides, ...rel].map(id => ({ id }));
      s.offerKind = null;
      s.screen = 'shop';
    } else {
      s.offer = this.rollOffer(e.kind === 'elite' ? 'elite' : 'normal');
      s.offerKind = e.kind === 'elite' ? 'elite' : 'normal';
      s.screen = 'reward';
    }
    s.combat = null;
    this.commit();
  }

  /** Objets encore obtenables d'une catégorie. */
  available(kind: Item['kind']): string[] {
    return this.content.items
      .filter(i => i.kind === kind && (kind === 'aide' || (this.state.relics[i.id] ?? 0) < (i.max ?? 1)))
      .map(i => i.id);
  }

  private rollOffer(kind: 'normal' | 'elite'): Offer[] {
    const pickN = (ids: string[], n: number) => {
      const out: string[] = [];
      let pool = [...ids];
      while (out.length < n && pool.length) {
        const id = this.rng.weighted(pool, x => RARITY_WEIGHT[this.itemById.get(x)!.rarity]);
        out.push(id);
        pool = pool.filter(x => x !== id);
      }
      return out;
    };
    if (kind === 'elite') {
      const r = pickN(this.available('reliquia'), 3);
      return (r.length ? r : pickN(this.available('aide'), 3)).map(id => ({ id }));
    }
    const mix = [...pickN(this.available('aide'), 2), ...pickN(this.available('reliquia'), 2)];
    return this.rng.shuffle(mix).slice(0, 3).map(id => ({ id }));
  }

  private gain(id: string) {
    const it = this.itemById.get(id)!;
    const s = this.state;
    if (it.kind === 'reliquia') {
      s.relics[id] = (s.relics[id] ?? 0) + 1;
      if (it.effect === 'maxHp') {
        s.maxHp += it.value ?? 4;
        s.hp += it.value ?? 4;
      }
    } else s.inv[id] = (s.inv[id] ?? 0) + 1;
  }

  /** Récompense : prendre l'objet n°i (ou passer si i < 0). */
  take(i: number) {
    const s = this.state;
    if (s.screen !== 'reward' || !s.offer) return;
    if (i >= 0 && s.offer[i]) this.gain(s.offer[i].id);
    this.nextRoom();
  }

  buy(i: number): boolean {
    const s = this.state, o = s.offer?.[i];
    if (s.screen !== 'shop' || !o || o.sold) return false;
    const it = this.itemById.get(o.id)!;
    if (s.gold < it.price) return false;
    s.gold -= it.price;
    this.gain(o.id);
    o.sold = true;
    this.commit();
    return true;
  }

  static readonly MEAL_PRICE = 4;
  static readonly MEAL_HEAL = 5;
  buyMeal(): boolean {
    const s = this.state;
    if (s.screen !== 'shop' || s.gold < Game.MEAL_PRICE || s.hp >= s.maxHp) return false;
    s.gold -= Game.MEAL_PRICE;
    s.hp = Math.min(s.maxHp, s.hp + Game.MEAL_HEAL);
    this.commit();
    return true;
  }

  leaveShop() {
    const s = this.state;
    if (s.screen !== 'shop') return;
    s.act++;
    s.room = 0;
    this.startFight();
    this.commit();
  }

  private nextRoom() {
    const s = this.state;
    s.room++;
    if (s.room >= s.rooms[s.act].length) {
      s.act++;
      s.room = 0;
    }
    this.startFight();
    this.commit();
  }

  /* ======================= Pouvoirs ======================= */

  usePower(id: string): boolean {
    if (this.powerBlock(id)) return false;
    const s = this.state, c = s.combat, it = this.itemById.get(id)!, q = this.question;
    switch (it.effect) {
      case 'heal':
        s.hp = Math.min(s.maxHp, s.hp + (it.value ?? 5));
        break;
      case 'translate':
        c!.used.translate = true;
        break;
      case 'hint':
        c!.used.hint = true;
        break;
      case 'scissors':
        c!.used.scissors = true;
        if (c!.q.mode === 'qcm') c!.hidden = this.rng.shuffle(c!.q.options.filter(o => o !== q!.answer)).slice(0, 2);
        else c!.mask = maskAnswer(q!.answer);
        break;
      case 'time':
        c!.timeLeft += (it.value ?? 15) * 1000;
        c!.timeMax = Math.max(c!.timeMax, c!.timeLeft);
        break;
      case 'swap':
        s.inv[id]--;
        this.ask(true);
        this.commit();
        return true;
      case 'oracle':
        s.inv[id]--;
        this.answer(q!.answer, 'oracle');
        return true;
      default:
        return false;
    }
    s.inv[id]--;
    this.commit();
    return true;
  }

  /** Texte de l'antisèche : la règle, sauf si elle dévoile la réponse. */
  hintText(): string {
    const q = this.question;
    if (!q) return '';
    const leaks = normalize(q.explanation).includes(normalize(q.answer));
    return leaks ? autoHint(q.answer) : q.explanation;
  }

  /* ======================= Fin ======================= */

  private end(win: boolean) {
    const s = this.state;
    s.screen = 'over';
    s.result = win ? 'win' : 'lose';
    s.stats.endedAt = Date.now();
    this.commit();
  }

  /** Abandon volontaire (bouton « Quitter la partie »). */
  abandon() {
    this.end(false);
  }
}
