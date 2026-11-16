/**
 * Moteur de partie : état sérialisable + actions. Aucun accès au DOM.
 * L'interface appelle les actions (choose, play, answer, usePower, proceed…) puis relit `state`.
 *
 * Le combat de la version 2 : à chaque tour, l'ennemi annonce son intention, l'élève reçoit une main de cartes
 * et en joue une ; la carte s'ouvre sur un défi en espagnol tiré de la banque ; réussi, l'effet se joue ;
 * raté, la carte ne fait rien. Puis l'ennemi agit, dans tous les cas.
 */
import { autoHint, fillBlanks, maskAnswer, normalize, type Verdict } from './answer';
import { generateMap, nodeById, reachable, type MapNode } from './map';
import { answerText, canonicalValue, givenText, isChoice, judgeQuestion, type Mode, scissorsHint, STRONG_MODES } from './questions';
import { Rng } from './rng';
import {
  type Act, type Card, type CardEffect, type CardInst, type Content, type Enemy, type EventEffect, type EventOutcome, type GameEvent, type Intent, type Item,
  type Phase, type Question, type Rarity, type RoomType, type Synergy, type Trait, levelNum,
} from './schema';
import {
  type Asked, BOSS_RARITY_WEIGHT, CARRY_MAX, type Feedback, type Fx, MAX_ASCENSION, type Offer, type QuizState, RARITY_WEIGHT,
  REMOVE_CARD_PRICE, RETRY_CHANCE, RETRY_GAP, type RunState, type Settings, SHIELD_MAX, WARMUP_MAX,
} from './core/types';
import { damageOf, describeEffects, drawCards, effectsOf, instName, scaleEffects } from './combat/cards';
import { Picker, type PickOpts } from './lang/picker';

export * from './core/types';
export type { Mode } from './questions';
export { describeEffects, effectsOf, FAMILIES, instName } from './combat/cards';

/** Une carte de la main, prête à être affichée. */
export interface HandCard {
  inst: CardInst;
  card: Card;
  /** Effets tels qu'ils se joueraient maintenant (amélioration, doublement, bonus compris). */
  effects: CardEffect[];
  /** Thème du défi et niveau. */
  theme: string;
  /** Le défi sera à l'écrit. */
  write: boolean;
  /** Texte en français des effets. */
  text: string;
}

/* ======================= Moteur ======================= */

export class Game {
  readonly content: Content;
  settings: Settings;
  state: RunState;
  private rng: Rng;
  private picker: Picker;
  private qById: Map<string, Question>;
  private enemyById: Map<string, Enemy>;
  private itemById: Map<string, Item>;
  private cardById: Map<string, Card>;
  private eventById: Map<string, GameEvent>;
  private listeners = new Set<() => void>();
  /** Appelé à chaque réponse corrigée (mise à jour des boîtes de Leitner). */
  onRecord?: (q: Question, v: Verdict) => void;

  constructor(content: Content, settings: Settings, state: RunState) {
    this.content = content;
    this.settings = settings;
    this.state = state;
    this.rng = new Rng(state.rng);
    this.qById = new Map(content.questions.map(q => [q.id, q]));
    this.enemyById = new Map(content.enemies.map(e => [e.id, e]));
    this.itemById = new Map(content.items.map(i => [i.id, i]));
    this.cardById = new Map(content.cards.map(c => [c.id, c]));
    this.eventById = new Map(content.events.map(e => [e.id, e]));
    this.picker = new Picker(content, { rng: this.rng, settings: () => this.settings, state: () => this.state });
  }

  /** Poids de tirage d'une question (révision de Leitner). */
  set weightOf(f: (q: Question) => number) {
    this.picker.weightOf = f;
  }
  get weightOf() {
    return this.picker.weightOf;
  }
  closeTo(a: string, b: string): boolean {
    return this.picker.closeTo(a, b);
  }

  /** Démarre une nouvelle partie à partir d'une graine. */
  static newRun(content: Content, settings: Settings, seed: string, now = Date.now(), opts: { character?: string; ascension?: number; pending?: string[] } = {}): Game {
    const rng = new Rng(seed);
    const p = content.sequence.player;
    const chars = content.sequence.characters;
    const ch = chars.find(c => c.id === opts.character) ?? chars.find(c => c.unlock.type === 'default') ?? chars[0];
    const asc = Math.max(0, Math.min(MAX_ASCENSION, opts.ascension ?? 0));
    const inv: Record<string, number> = { ...p.startItems };
    if (asc >= 3) {
      // Calavera 3 : une aide de départ en moins
      const last = Object.keys(inv).filter(k => inv[k] > 0).pop();
      if (last) inv[last]--;
    }
    for (const [id, n] of Object.entries(ch?.bonus.items ?? {})) inv[id] = (inv[id] ?? 0) + n;
    const relics: Record<string, number> = { ...(ch?.bonus.relics ?? {}) };
    const hp = Math.max(5, p.hp + (ch?.bonus.hp ?? 0) - (asc >= 9 ? 5 : 0));
    const known = new Set(content.cards.map(c => c.id));
    let uid = 1;
    const deck: CardInst[] = [];
    for (const id of p.deck) if (known.has(id)) deck.push({ uid: uid++, id });
    for (const b of ch?.bonus.cards ?? []) {
      if (!known.has(b.id)) continue;
      const inst: CardInst = { uid: uid++, id: b.id };
      if (b.up) inst.up = b.up;
      deck.push(inst);
    }
    const state: RunState = {
      v: 4, seed, rng: rng.state, screen: 'map', hp, maxHp: hp, gold: 0, act: 0,
      character: ch?.id ?? '', ascension: asc, bonus: { writeShare: ch?.bonus.writeShare ?? 0, restHeal: ch?.bonus.restHeal ?? 0.3 },
      defeated: [], obtained: Object.keys(relics),
      map: generateMap(rng, content.sequence.map), node: null, path: [],
      inv, relics, upgrades: {}, deck, nextUid: uid, streak: 0, poison: 0, reviveUsed: false, luckyCount: 0,
      stats: { ok: 0, ko: 0, casi: 0, won: 0, written: 0, turns: 0, rooms: 0, startedAt: now, endedAt: 0, maxStreak: 0, perfectFights: 0, powersUsed: 0, cards: 0, cardsOk: 0 },
      seen: {}, retry: [], errors: [], metEnemies: [], seenEvents: [],
      combat: null, offer: null, offerKind: null, cardOffer: null, event: null, chest: null, rest: null, result: null,
    };
    const g = new Game(content, settings, state);
    g.startWarmup(opts.pending ?? []);
    g.commit();
    return g;
  }

  /** Applique de nouveaux réglages en cours de partie (chrono coupé ou rallumé depuis les Options). */
  updateSettings(settings: Settings) {
    this.settings = settings;
    const c = this.state.combat;
    // chrono coupé : le défi en cours n'est plus minuté ; rallumé, il reprend au défi suivant
    if (c && !settings.chrono) c.timeMax = c.timeLeft = 0;
    this.commit();
  }

  /* ---------- almas pendientes : échauffement ---------- */

  /** Nombre de questions ratées qui attendent d'être reposées. */
  get pendingCount(): number {
    return this.state.retry.length;
  }

  private quizFor(q: Question): QuizState {
    return { q: this.picker.makeAsked(q, this.picker.chooseMode(q, this.writeChance())), fb: null };
  }

  /** Les questions ratées aux parties précédentes : les premières en échauffement, les suivantes pendant la partie. */
  private startWarmup(pending: string[]) {
    const s = this.state;
    const themes = this.activeThemes();
    const ids = [...new Set(pending)].filter(id => {
      const q = this.qById.get(id);
      return !!q && this.picker.isUsable(q) && themes.includes(q.theme);
    }).slice(0, CARRY_MAX);
    const warm = ids.slice(0, WARMUP_MAX);
    s.retry = ids.slice(WARMUP_MAX);
    if (!warm.length) return;
    s.warmup = { ids: warm, i: 0, quiz: this.quizFor(this.qById.get(warm[0])!), freed: 0 };
    s.screen = 'warmup';
  }

  warmupAnswer(value: string) {
    const s = this.state, w = s.warmup;
    if (s.screen !== 'warmup' || !w) return;
    const v = this.answerQuiz(w.quiz, value);
    if (v === 'ok') {
      w.freed++;
      s.maxHp++;
      s.hp++;
    }
    if (v) this.commit();
  }

  /** Question suivante de l'échauffement, ou départ sur la carte. */
  warmupNext() {
    const s = this.state, w = s.warmup;
    if (s.screen !== 'warmup' || !w || !w.quiz.fb) return;
    if (w.i + 1 >= w.ids.length) s.screen = 'map';
    else {
      w.i++;
      w.quiz = this.quizFor(this.qById.get(w.ids[w.i])!);
    }
    this.commit();
  }

  /** Passe l'échauffement : les questions restantes reviendront pendant la partie. */
  warmupSkip() {
    const s = this.state, w = s.warmup;
    if (s.screen !== 'warmup' || !w) return;
    const rest = w.ids.slice(w.quiz.fb ? w.i + 1 : w.i).filter(id => !s.retry.includes(id));
    s.retry = [...rest, ...s.retry];
    s.screen = 'map';
    this.commit();
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
  /** Question du défi en cours (null tant qu'aucune carte n'est jouée). */
  get question(): Question | null {
    const c = this.state.combat;
    return c && c.stage !== 'hand' && c.q.id ? this.qById.get(c.q.id) ?? null : null;
  }
  get currentNode(): MapNode | null {
    return this.state.node ? nodeById(this.state.map, this.state.node) ?? null : null;
  }
  get currentEvent(): GameEvent | null {
    return this.state.event ? this.eventById.get(this.state.event.id) ?? null : null;
  }
  item(id: string): Item | undefined {
    return this.itemById.get(id);
  }
  cardDef(id: string): Card | undefined {
    return this.cardById.get(id);
  }
  cardInst(uid: number): CardInst | undefined {
    return this.state.deck.find(c => c.uid === uid);
  }
  getQuestion(id: string): Question | undefined {
    return this.qById.get(id);
  }
  enemyDef(id: string): Enemy | undefined {
    return this.enemyById.get(id);
  }
  reachable(): MapNode[] {
    return this.state.screen === 'map' ? reachable(this.state.map, this.state.node) : [];
  }
  relicCount(effect: Item['effect']): number {
    let n = 0;
    for (const [id, k] of Object.entries(this.state.relics)) if (this.itemById.get(id)?.effect === effect) n += k;
    return n;
  }
  relicValue(effect: Item['effect'], fallback = 1): number {
    let n = 0;
    for (const [id, k] of Object.entries(this.state.relics)) {
      const it = this.itemById.get(id);
      if (it?.effect === effect) n += k * (it.value ?? fallback);
    }
    return n;
  }
  /** Synergies complètes (toutes leurs reliques possédées). */
  activeSynergies(): Synergy[] {
    return this.content.synergies.filter(s => s.items.every(id => (this.state.relics[id] ?? 0) > 0));
  }
  /** Synergies commencées : nombre de reliques possédées sur le total. */
  synergyProgress(): { synergy: Synergy; owned: number }[] {
    return this.content.synergies
      .map(s => ({ synergy: s, owned: s.items.filter(id => (this.state.relics[id] ?? 0) > 0).length }))
      .filter(x => x.owned > 0);
  }
  private synergy(effect: Synergy['effect']): Synergy | undefined {
    return this.activeSynergies().find(s => s.effect === effect);
  }
  traits(): Set<Trait> {
    const e = this.enemy;
    return new Set([...(e?.traits ?? []), ...(this.phase?.traits ?? [])]);
  }
  get streakThreshold(): number {
    return this.relicCount('streakMaster') ? 2 : 3;
  }
  isUpgraded(id: string): boolean {
    return !!this.state.upgrades[id];
  }
  /** Le Traductor gratuit du Diccionario est-il disponible ? */
  freeTranslateAvailable(): boolean {
    const c = this.state.combat;
    return !!c && this.relicCount('freeTranslate') > 0 && !c.freeTranslateUsed;
  }
  /** Les pouvoirs sont-ils utilisables maintenant ? Renvoie la raison sinon. */
  powerBlock(id: string): string | null {
    const s = this.state, c = s.combat, it = this.itemById.get(id), q = this.question;
    if (!it) return 'inconnu';
    const free = it.effect === 'translate' && this.freeTranslateAvailable();
    if (!(s.inv[id] > 0) && !free) return 'non possédé';
    if (it.auto) return 'automatique';
    if (it.effect === 'heal') return s.hp >= s.maxHp ? 'vie pleine' : null;
    if (s.screen !== 'combat' || !c || c.fb) return 'hors combat';
    if (it.effect === 'cancelIntent') return c.canceled ? 'déjà utilisé' : null;
    if (it.effect === 'swap') return null;
    if (c.stage !== 'challenge' || !q) return 'choisis d’abord une carte';
    if (c.fog) return 'brouillard';
    if (this.enemy?.modifier === 'niebla' && (it.effect === 'translate' || it.effect === 'hint')) return 'niebla';
    switch (it.effect) {
      case 'translate': return !this.translationText() ? 'rien à traduire' : c.used.translate ? 'déjà utilisé' : null;
      case 'hint': return c.used.hint ? 'déjà utilisé' : null;
      case 'scissors': return c.used.scissors ? 'déjà utilisé' : c.q.mode === 'tf' ? 'inutile ici' : null;
      case 'time': return c.timeMax ? null : 'pas de chrono';
      default: return null;
    }
  }

  /* ======================= Carte ======================= */

  /** Entre dans une salle accessible de la carte. */
  choose(nodeId: string): boolean {
    const s = this.state;
    if (s.screen !== 'map') return false;
    const node = reachable(s.map, s.node).find(n => n.id === nodeId);
    if (!node) return false;
    s.node = node.id;
    s.path.push(node.id);
    s.stats.rooms++;
    this.enterRoom(node.type);
    this.commit();
    return true;
  }

  private enterRoom(type: RoomType) {
    const s = this.state;
    s.offer = null;
    s.offerKind = null;
    s.cardOffer = null;
    s.event = s.chest = s.rest = null;
    switch (type) {
      case 'combat': return this.startFight(this.pickEnemy('normal'));
      case 'elite': return this.startFight(this.pickEnemy('elite'));
      case 'boss': return this.startFight(this.act.boss);
      case 'shop': {
        const aides = this.pickItems(this.available('aide'), 3, RARITY_WEIGHT);
        const rel = this.pickItems(this.available('reliquia'), 2, RARITY_WEIGHT);
        s.offer = [...aides, ...rel].map(id => ({ id }));
        s.cardOffer = this.rollCards(2).map(id => ({ id }));
        s.screen = 'shop';
        return;
      }
      case 'rest':
        s.rest = { result: null };
        s.screen = 'rest';
        return;
      case 'chest':
        s.chest = { locked: this.rng.chance(0.4), quiz: null, result: null };
        s.screen = 'chest';
        return;
      case 'event': {
        const ev = this.pickEvent();
        if (!ev) return this.startFight(this.pickEnemy('normal'));
        s.seenEvents.push(ev.id);
        s.event = { id: ev.id, choice: null, quiz: null, result: null, pendingFight: null };
        s.screen = 'event';
        return;
      }
    }
  }

  private toMap() {
    const s = this.state;
    s.screen = 'map';
    s.combat = null;
    s.offer = null;
    s.offerKind = null;
    s.cardOffer = null;
    s.event = s.chest = s.rest = null;
  }

  private nextAct() {
    const s = this.state;
    s.act++;
    s.map = generateMap(this.rng, this.content.sequence.map);
    s.node = null;
    s.path = [];
    s.metEnemies = [];
    this.toMap();
  }

  private pickEnemy(kind: 'normal' | 'elite'): string {
    const s = this.state;
    const pool = kind === 'elite' ? this.act.elites : this.act.enemies;
    const fresh = pool.filter(id => !s.metEnemies.includes(id));
    const id = this.rng.pick(fresh.length ? fresh : pool);
    s.metEnemies.push(id);
    return id;
  }

  private pickEvent(): GameEvent | null {
    const s = this.state, actNo = s.act + 1;
    const ok = this.content.events.filter(e => !e.acts || e.acts.includes(actNo));
    const fresh = ok.filter(e => !s.seenEvents.includes(e.id));
    const pool = fresh.length ? fresh : ok;
    return pool.length ? this.rng.pick(pool) : null;
  }

  /* ======================= Questions ======================= */

  /** Thèmes jouables (réglages ∩ séquence). */
  activeThemes(): string[] {
    return this.picker.activeThemes();
  }

  /** Part de base des réponses écrites hors règles spéciales. */
  private writeChance(boost = 0): number {
    const s = this.state;
    const extra = s.bonus.writeShare + (s.ascension >= 8 ? 0.15 : 0);
    return Math.min(1, (this.act.writeShare + boost + extra) * this.settings.writeFactor);
  }

  /**
   * Enregistre le résultat d'une réponse (statistiques, carnet, almas pendientes).
   * Renvoie true si une « alma » est libérée : une question déjà ratée, maintenant réussie.
   */
  private record(q: Question, v: Verdict, given: string | null, mode: Mode): boolean {
    const s = this.state;
    this.onRecord?.(q, v);
    if (v !== 'ok' && s.screen === 'combat' && s.combat) s.combat.errors++;
    if (v === 'ok') {
      s.stats.ok++;
      if (mode === 'write') s.stats.written++;
      const w = s.screen === 'warmup' ? s.warmup : null;
      const freed = s.retry.includes(q.id) || !!w?.ids.includes(q.id);
      s.retry = s.retry.filter(id => id !== q.id);
      if (freed) s.stats.freed = (s.stats.freed ?? 0) + 1;
      return freed;
    } else if (v === 'casi') {
      s.stats.casi++;
      this.logError(q, given);
    } else {
      s.stats.ko++;
      this.logError(q, given);
      if (!s.retry.includes(q.id)) s.retry.push(q.id);
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

  private judgeAsked(asked: Asked, value: string): Verdict | null {
    const q = this.qById.get(asked.id);
    if (!q) return null;
    return judgeQuestion(q, asked.mode, value, this.checkOptions(q));
  }

  /** Question hors combat (événements, coffres). */
  private makeQuiz(o: { themes?: string[]; write?: boolean; level?: 1 | 2 | 3 }): QuizState {
    const active = this.activeThemes();
    const themes = o.themes?.filter(t => active.includes(t)) ?? [];
    const q = this.picker.pick({ themes: themes.length ? themes : active, level: o.level ?? this.act.level, needWrite: !!o.write && this.settings.writeFactor > 0 });
    return { q: this.picker.makeAsked(q, this.picker.chooseMode(q, this.writeChance(), !!o.write)), fb: null };
  }

  private answerQuiz(quiz: QuizState, value: string): Verdict | null {
    if (quiz.fb) return null;
    const v = this.judgeAsked(quiz.q, value);
    if (!v) return null;
    const q = this.qById.get(quiz.q.id)!;
    this.record(q, v, value, quiz.q.mode);
    quiz.fb = { verdict: v, given: value };
    return v;
  }

  /* ======================= Combat ======================= */

  private startFight(enemyId: string) {
    const s = this.state;
    const e = this.enemyById.get(enemyId)!;
    s.screen = 'combat';
    s.offer = null;
    s.offerKind = null;
    s.cardOffer = null;
    s.poison = 0;
    const abanico = e.phases?.[0]?.abanico ?? 0;
    const a = s.ascension;
    const hp = e.hp + (a >= 1 ? 2 : 0) + (a >= 4 && e.kind === 'elite' ? 4 : 0) + (a >= 7 && (e.kind === 'jefe' || e.kind === 'final') ? 6 : 0) + (a >= 10 && e.kind === 'final' ? 10 : 0);
    s.combat = {
      enemyId: e.id, hp, maxHp: hp, shield: 0, abanico: this.settings.writeFactor > 0 ? abanico : 0,
      phase: 0, turn: 0, intent: { kind: 'attack' }, canceled: false, attackBonus: e.phases?.[0]?.attackBonus ?? 0, weakTheme: null,
      juicio: false, vanishUsed: false, firstErrorUsed: false, freeTranslateUsed: false, rowCorrect: 0, errors: 0, fog: false,
      stage: 'hand', draw: this.rng.shuffle(s.deck.map(c => c.uid)), hand: [], discard: [], spent: [], played: null, lastCard: null, pshield: 0, double: false,
      q: { id: '', mode: 'qcm', options: [] }, fb: null, used: {}, hidden: [], mask: '', timeMax: 0, timeLeft: 0,
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
    if (it.kind === 'listen' && this.settings.types && !this.settings.types.includes('ecoute')) it = { kind: 'attack' };
    return { ...it };
  }

  /** Nouveau tour : l'ennemi annonce, une main est distribuée. */
  private nextTurn() {
    const s = this.state, c = s.combat!;
    c.turn++;
    s.stats.turns++;
    c.intent = this.rollIntent();
    c.canceled = false;
    c.pshield = 0;
    c.played = null;
    c.fb = null;
    c.q = { id: '', mode: 'qcm', options: [] };
    c.used = {};
    c.hidden = [];
    c.mask = '';
    c.timeMax = c.timeLeft = 0;
    const tr = this.traits();
    c.fog = c.intent.kind === 'fog';
    c.juicio = tr.has('juicio') && c.turn % 3 === 0;
    c.weakTheme = tr.has('colorShift') ? this.rng.pick(this.deckThemes()) : null;
    if (c.intent.kind === 'shield') c.shield += c.intent.value ?? 2;
    this.deal();
    c.stage = 'hand';
  }

  /** Thèmes des cartes de la baraja (pour la faiblesse de l'Alebrije). */
  private deckThemes(): string[] {
    const t = new Set(this.state.deck.map(d => this.cardById.get(d.id)?.theme).filter((x): x is string => !!x));
    const active = this.activeThemes().filter(x => t.has(x));
    return active.length ? active : this.activeThemes();
  }

  private deal() {
    const s = this.state, c = s.combat!;
    const n = this.content.sequence.player.hand;
    // les cartes non jouées de la main précédente vont à la défausse
    c.discard.push(...c.hand);
    c.hand = [];
    // les cartes « une fois par combat » déjà jouées ne reviennent pas
    c.discard = c.discard.filter(u => !c.spent.includes(u));
    const r = drawCards(this.rng, c.draw.filter(u => !c.spent.includes(u)), c.discard, n);
    c.hand = r.hand;
    c.draw = r.draw;
    c.discard = r.discard;
  }

  /** Les cartes en main, avec leurs effets calculés. */
  hand(): HandCard[] {
    const c = this.state.combat;
    if (!c) return [];
    return c.hand.map(uid => this.handCard(uid)).filter((x): x is HandCard => !!x);
  }

  private handCard(uid: number): HandCard | null {
    const inst = this.cardInst(uid), c = this.state.combat;
    const card = inst && this.cardById.get(inst.id);
    if (!inst || !card || !c) return null;
    const effects = this.effectsNow(card, inst);
    return { inst, card, effects, theme: this.cardTheme(card), write: inst.up === 'pluma', text: describeEffects(effects) };
  }

  private describe(effects: CardEffect[]): string {
    return describeEffects(effects);
  }

  /** Effets d'une carte si elle était jouée maintenant : amélioration, pluma, doublement. */
  private effectsNow(card: Card, inst: CardInst): CardEffect[] {
    const c = this.state.combat;
    let k = 1;
    if (inst.up === 'pluma') k *= 2;
    if (c?.double) k *= 2;
    return scaleEffects(effectsOf(card, inst), k);
  }

  /** Thème du défi d'une carte : celui de la carte s'il est actif, sinon un thème actif. */
  private cardTheme(card: Card): string {
    const active = this.activeThemes();
    return active.includes(card.theme) ? card.theme : active[0];
  }

  /** Joue la carte n°i de la main : le défi s'ouvre. */
  play(i: number): boolean {
    const s = this.state, c = s.combat;
    if (s.screen !== 'combat' || !c || c.stage !== 'hand') return false;
    const uid = c.hand[i];
    const hc = uid !== undefined ? this.handCard(uid) : null;
    if (!hc) return false;
    c.played = uid;
    c.hand = c.hand.filter(u => u !== uid);
    s.stats.cards = (s.stats.cards ?? 0) + 1;
    c.stage = 'challenge';
    this.ask(hc);
    this.commit();
    return true;
  }

  private needsWrite(): boolean {
    return this.enemy?.modifier === 'soloEscrito' && this.settings.writeFactor > 0;
  }

  /** Seules les questions possibles à l'écrit sont tirées (élite « Solo escrito », abanico, carte « a la pluma »). */
  private writableOnly(hc?: HandCard | null): boolean {
    return this.settings.writeFactor > 0 && (this.enemy?.modifier === 'soloEscrito' || this.traits().has('abanico') || !!hc?.write);
  }

  private targetLevel(card?: Card): 1 | 2 | 3 | 4 {
    const e = this.enemy!, ph = this.phase;
    if (ph?.levels?.length) return levelNum(this.rng.pick(ph.levels));
    if (card?.level) return levelNum(card.level);
    if (e.kind === 'final') return this.rng.chance(0.6) ? 4 : 3;
    const L = this.act.level;
    if (e.kind === 'jefe' && L >= 2) return this.rng.chance(0.25) ? 4 : L;
    if (e.kind !== 'normal') return L;
    return L === 1 || this.rng.chance(0.65) ? L : ((L - 1) as 1 | 2);
  }

  private combatPickOpts(hc: HandCard | null, easier = false): PickOpts {
    const c = this.state.combat!, e = this.enemy!, ph = this.phase;
    let themes = hc ? [hc.theme] : this.activeThemes();
    if (ph?.themes && !hc) {
      const t = themes.filter(x => ph.themes!.includes(x));
      if (t.length) themes = t;
    }
    if (c.juicio && e.focusTheme && this.activeThemes().includes(e.focusTheme)) themes = [e.focusTheme];
    let level = this.targetLevel(hc?.card);
    if (easier && level > 1) level = (level - 1) as 1 | 2 | 3;
    const listen = c.intent.kind === 'listen' && !c.canceled;
    return { themes, level, needWrite: this.writableOnly(hc), weakTheme: null, onlyType: listen ? 'ecoute' : undefined };
  }

  private modeFor(q: Question, hc: HandCard | null): Mode {
    const e = this.enemy!, tr = this.traits();
    let p = this.writeChance(e.kind === 'jefe' ? 0.1 : 0);
    if (e.kind === 'final') p = Math.min(1, 0.5 * this.settings.writeFactor);
    if (tr.has('abanico')) p = Math.min(1, 0.75 * this.settings.writeFactor);
    return this.picker.chooseMode(q, p, this.needsWrite() || !!hc?.write || this.relicCount('allWrite') > 0);
  }

  /** Tire le défi de la carte jouée. */
  private ask(hc: HandCard | null, forceNew = false, easier = false) {
    const s = this.state, c = s.combat!, e = this.enemy!;
    let q: Question | undefined;
    let again = false;
    const opts = this.combatPickOpts(hc, easier);
    if (!forceNew && s.retry.length && e.kind !== 'final' && !c.juicio && this.rng.chance(RETRY_CHANCE)) {
      // alma pendiente : une question ratée, du thème de la carte, posable maintenant, pas trop tôt et pas proche des dernières posées.
      // Elle reste en attente tant qu'elle n'est pas réussie.
      const recent = (s.recent ?? []).slice(-RETRY_GAP);
      const id = s.retry.find(r => {
        const x = this.qById.get(r);
        return !!x && this.picker.isUsable(x) && opts.themes.includes(x.theme) && !recent.includes(r) && !this.picker.clashes(r)
          && (!opts.needWrite || this.picker.canWrite(x)) && (!opts.onlyType || x.type === opts.onlyType);
      });
      if (id) {
        q = this.qById.get(id);
        again = true;
      }
    }
    if (!q) {
      q = this.picker.pick(opts);
      again = false;
    }
    c.q = this.picker.makeAsked(q, this.modeFor(q, hc), again);
    const mode = c.q;
    c.fb = null;
    c.used = {};
    c.hidden = [];
    c.mask = '';
    if (!this.settings.chrono) {
      c.timeMax = c.timeLeft = 0;
    } else {
      let sec = this.traits().has('ultimoBaile') ? 15 : this.act.chrono;
      sec += { write: 10, order: 12, match: 10, place: 15, qcm: 0, tf: -5 }[mode.mode] ?? 0;
      if (q.type === 'ecoute') sec += 6;
      sec += this.relicValue('slowTime', 10);
      if (e.modifier === 'prisa') sec *= 0.5;
      if (s.ascension >= 2) sec -= 3;
      sec *= this.settings.chronoFactor;
      if (c.intent.kind === 'rush' && !c.canceled) sec -= c.intent.value ?? 5;
      sec = Math.max(6, Math.round(sec));
      c.timeMax = c.timeLeft = sec * 1000;
    }
  }

  /** Avance le chrono. Renvoie true si l'état a changé (fin du temps). */
  tick(ms: number): boolean {
    const c = this.state.combat;
    if (this.state.screen !== 'combat' || !c || c.stage !== 'challenge' || c.fb || !c.timeMax) return false;
    c.timeLeft = Math.max(0, c.timeLeft - ms);
    if (c.timeLeft <= 0) {
      this.answer(null, 'timeout');
      return true;
    }
    return false;
  }

  /** Juge une réponse au combat sans rien modifier. */
  judge(value: string): Verdict | null {
    const c = this.state.combat;
    return c && c.stage === 'challenge' ? this.judgeAsked(c.q, value) : null;
  }

  /** Carte en cours de jeu. */
  get playedCard(): HandCard | null {
    const c = this.state.combat;
    return c?.played != null ? this.handCard(c.played) : null;
  }

  /** Répond au défi de la carte jouée. how = 'timeout' ou 'oracle' pour les cas spéciaux. */
  answer(value: string | null, how: 'normal' | 'timeout' | 'oracle' = 'normal'): Feedback | null {
    const s = this.state, c = s.combat, q = this.question, e = this.enemy;
    if (s.screen !== 'combat' || !c || c.stage !== 'challenge' || !q || !e || c.fb) return null;
    const hc = this.playedCard;
    if (!hc) return null;
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
      outcome: how === 'normal' ? v : how, fx: ['card'], title: '', given: value, lines: [], enemyLines: [], card: hc.card.id,
      dmgToEnemy: 0, dmgToPlayer: 0, shieldGained: 0, healed: 0,
    };
    const tr = this.traits();
    // l'Oráculo amélioré compte comme une vraie réponse écrite
    const strongOracle = how === 'oracle' && this.isUpgraded(this.idByEffect('oracle') ?? '');
    const counts = how !== 'oracle' || strongOracle;
    const written = STRONG_MODES.includes(c.q.mode) || strongOracle;
    const name = instName(hc.card, hc.inst);

    if (v === 'ok' || v === 'casi') {
      let freed = false;
      if (v === 'ok') {
        if (counts) {
          s.streak++;
          s.stats.maxStreak = Math.max(s.stats.maxStreak, s.streak);
          c.rowCorrect++;
          freed = how !== 'oracle' && this.record(q, 'ok', value, c.q.mode);
          if (written && c.q.mode === 'write' && !hc.write) fb.fx.push('crit');
          if (written) {
            const g = this.synergy('goldOnWrite');
            if (g) s.gold += g.value ?? 1;
          }
        }
        fb.title = how === 'oracle' ? seq.feedback.oracle : this.rng.pick(seq.feedback.ok);
      } else {
        this.record(q, 'casi', value, c.q.mode);
        fb.fx.push('casi');
        fb.title = seq.feedback.casi;
        fb.lines.push("Il manque un accent (ou un tilde) : la carte ne donne que la moitié de son effet. Ta série continue.");
      }
      s.stats.cardsOk = (s.stats.cardsOk ?? 0) + 1;
      // effets de la carte
      let effects = hc.effects;
      if (v === 'casi') effects = scaleEffects(effects, 0.5);
      // réponse écrite non imposée : un petit bonus de dégâts (comme dans la version 1)
      const writeBonus = written && v === 'ok' && !hc.write ? 1 + this.relicValue('writeBonus') + (this.relicCount('allWrite') ? this.relicValue('allWrite', 2) : 0) : 0;
      const wasDouble = c.double;
      c.double = false;
      this.applyCard(effects, hc, fb, { writeBonus, name });
      if (wasDouble) fb.lines.unshift('Mayas y aztecas : effet doublé !');
      c.lastCard = hc.card.id;
      if (c.juicio && c.shield > 0) {
        c.shield = 0;
        fb.fx.push('juicio');
        fb.lines.push(`Juicio réussi : le bouclier de ${e.name} tombe !`);
      }
      const heal = this.synergy('healOnCorrect');
      if (heal && s.hp < s.maxHp && v === 'ok') {
        const h = Math.min(s.maxHp - s.hp, heal.value ?? 1);
        s.hp += h;
        fb.healed += h;
        fb.fx.push('playerHeal');
        fb.lines.push(`${heal.name} : +${h} PV.`);
      }
      if (freed) {
        const h = Math.min(s.maxHp - s.hp, 1);
        s.hp += h;
        fb.healed += h;
        if (h && !fb.fx.includes('playerHeal')) fb.fx.push('playerHeal');
        fb.fx.push('alma');
        fb.lines.push(`Alma liberada : tu avais raté cette question, tu la réussis.${h ? ' +1 PV.' : ''}`);
      }
      if (this.relicCount('luckyCards') && how !== 'oracle' && v === 'ok') {
        s.luckyCount++;
        const every = this.relicValue('luckyCards', 4) / this.relicCount('luckyCards');
        if (s.luckyCount % every === 0) {
          const id = this.gainRandom('aide');
          if (id) fb.lines.push(`Lotería ! Tu gagnes : ${this.itemById.get(id)!.name}.`);
        }
      }
      const gold = 1 + this.relicValue('goldPerCorrect');
      s.gold += gold;
      fb.lines.push(`+${gold} 🪙`);
    } else {
      this.record(q, 'ko', value, c.q.mode);
      s.streak = 0;
      c.rowCorrect = 0;
      fb.title = how === 'timeout' ? seq.feedback.timeout : this.rng.pick(seq.feedback.ko);
      fb.fx.push('zero');
      fb.lines.push(how === 'timeout' ? `Le temps est écoulé : ${name} ne fait rien.` : `${name} ne fait rien.`);
      if (tr.has('vanidad') && c.hp > 0) {
        c.hp = Math.min(c.maxHp, c.hp + 1);
        fb.lines.push(`${e.name} admire son reflet et récupère 1 PV.`);
      }
    }
    // la carte quitte la main
    if (hc.card.once) c.spent.push(hc.inst.uid);
    else c.discard.push(hc.inst.uid);

    // l'ennemi agit
    if (c.hp > 0) this.enemyActs(fb, v);
    if (s.poison > 0 && s.hp > 0 && c.hp > 0) {
      s.hp = Math.max(0, s.hp - 1);
      s.poison--;
      fb.dmgToPlayer += 1;
      if (!fb.fx.includes('playerHit')) fb.fx.push('poison');
      fb.enemyLines.push(`Le poison te fait perdre 1 PV (${s.poison} restant${s.poison > 1 ? 's' : ''}).`);
    }
    if (s.hp <= 0) this.tryRevive(fb);
    if (s.hp <= 0) fb.fx.push('playerDown');
    if (c.hp <= 0) fb.fx.push('enemyDown');
    // changement de phase
    if (e.phases && c.hp > 0) {
      let p = c.phase;
      while (p + 1 < e.phases.length && c.hp / c.maxHp <= e.phases[p + 1].from) p++;
      if (p !== c.phase) {
        c.phase = p;
        const ph = e.phases[p];
        c.abanico = this.settings.writeFactor > 0 ? ph.abanico ?? 0 : 0;
        c.attackBonus = ph.attackBonus;
        fb.fx.push('phase');
        fb.alert = `${ph.name} — ${ph.message}`;
      }
    }
    c.fb = fb;
    c.stage = 'resolve';
    this.commit();
    return fb;
  }

  /** Applique les effets d'une carte réussie. */
  private applyCard(effects: CardEffect[], hc: HandCard, fb: Feedback, o: { writeBonus: number; name: string }, depth = 0) {
    const s = this.state, c = s.combat!, e = this.enemy!, q = this.question!, tr = this.traits();
    for (const ef of effects) {
      switch (ef.do) {
        case 'damage':
        case 'strike': {
          const times = ef.times ?? 1;
          for (let k = 0; k < times; k++) {
            let dmg = (ef.value ?? 0) + this.relicValue('damageBonus') + (k === 0 ? o.writeBonus : 0);
            const th = this.streakThreshold;
            if (k === 0 && s.streak >= th && dmg > 0) {
              fb.fx.push('combo');
              let bonus = (th === 2 ? 2 : 1) + this.relicValue('streakBonus');
              if (this.synergy('streakDouble')) bonus *= 2;
              dmg += bonus;
              fb.combo = s.streak;
            }
            if (k === 0 && c.weakTheme && c.weakTheme === q.theme) {
              dmg += 2;
              fb.lines.push(`${e.name} est vulnérable à ce thème : +2 dégâts.`);
            }
            if (tr.has('ultimoBaile') && s.streak >= 3) dmg *= 2;
            this.hitEnemy(dmg, ef.do === 'strike', fb);
          }
          break;
        }
        case 'streakBonus':
          if (s.streak >= (ef.streak ?? 3) && (ef.value ?? 0) > 0) {
            fb.lines.push(`Série de ${s.streak} : ${o.name} frappe plus fort (+${ef.value}).`);
            this.hitEnemy(ef.value ?? 0, false, fb);
          }
          break;
        case 'shield': {
          const g = Math.min(SHIELD_MAX - c.pshield, ef.value ?? 0);
          if (g > 0) {
            c.pshield += g;
            fb.shieldGained += g;
            fb.fx.push('playerShield');
            fb.lines.push(`Bouclier ${c.pshield} : il encaisse l'attaque de ce tour.`);
          }
          break;
        }
        case 'heal': {
          const h = Math.min(s.maxHp - s.hp, ef.value ?? 0);
          if (h > 0) {
            s.hp += h;
            fb.healed += h;
            fb.fx.push('playerHeal');
            fb.lines.push(`Tu récupères ${h} PV.`);
          } else if ((ef.value ?? 0) > 0) fb.lines.push('Ta vie est déjà pleine.');
          break;
        }
        case 'double':
          c.double = true;
          fb.lines.push('Ta prochaine carte aura un effet doublé.');
          break;
        case 'cleanse':
          if (c.shield > 0 || c.abanico > 0) {
            fb.fx.push('cleanse');
            fb.lines.push(`${c.shield > 0 ? 'Le bouclier' : ''}${c.shield > 0 && c.abanico > 0 ? ' et ' : ''}${c.abanico > 0 ? "l'abanico" : ''} de ${e.name} se dissipe${c.shield > 0 && c.abanico > 0 ? 'nt' : ''}.`);
            c.shield = 0;
            c.abanico = 0;
          } else fb.lines.push(`${e.name} n'avait rien à dissiper.`);
          break;
        case 'gold':
          s.gold += ef.value ?? 0;
          fb.lines.push(`+${ef.value} 🪙 (${o.name}).`);
          break;
        case 'repeatLast': {
          const last = c.lastCard ? this.cardById.get(c.lastCard) : null;
          if (last && depth === 0) {
            fb.lines.push(`${o.name} imite ${last.name} !`);
            const again = effectsOf(last).filter(x => x.do !== 'repeatLast' && x.do !== 'double');
            this.applyCard(again, hc, fb, { writeBonus: 0, name: last.name }, depth + 1);
          } else if (!last) fb.lines.push("Aucune carte à imiter pour l'instant.");
          break;
        }
      }
    }
    if (fb.dmgToEnemy > 0 && !fb.fx.includes('enemyHit')) fb.fx.push('enemyHit');
  }

  /** Dégâts à l'ennemi, en passant par l'esquive, l'abanico et le bouclier (sauf « strike »). */
  private hitEnemy(dmg: number, pierce: boolean, fb: Feedback) {
    const c = this.state.combat!, e = this.enemy!, tr = this.traits();
    if (dmg <= 0) return;
    if (tr.has('vanish') && !c.vanishUsed) {
      c.vanishUsed = true;
      fb.fx.push('vanish');
      fb.lines.push(`${e.name} disparaît : ton coup passe à travers ! La prochaine fois, ça touchera.`);
      return;
    }
    if (!pierce && c.abanico > 0) {
      if (c.q.mode === 'write' || fb.outcome === 'oracle') {
        const a = Math.min(c.abanico, dmg);
        c.abanico -= a;
        dmg -= a;
        fb.lines.push(c.abanico > 0 ? `L'abanico se déchire (${c.abanico} restant).` : "L'abanico est brisé !");
      } else {
        fb.fx.push('abanico');
        fb.lines.push("L'abanico bloque les défis en QCM : joue une carte « a la pluma » ou écris pour le briser !");
        return;
      }
    }
    if (!pierce && dmg > 0 && c.shield > 0) {
      const a = Math.min(c.shield, dmg);
      c.shield -= a;
      dmg -= a;
      fb.fx.push('shieldHit');
      fb.lines.push(`Le bouclier de ${e.name} absorbe ${a} dégât${a > 1 ? 's' : ''}.`);
    }
    if (dmg > 0) {
      c.hp = Math.max(0, c.hp - dmg);
      fb.dmgToEnemy += dmg;
      if (pierce) fb.fx.push('strike');
      fb.lines.push(`${e.name} perd ${dmg} PV.`);
    }
  }

  private tryRevive(fb: { lines: string[]; alert?: string; fx?: Fx[] }) {
    const s = this.state;
    if (s.hp > 0 || s.reviveUsed || !this.relicCount('revive')) return;
    s.reviveUsed = true;
    s.hp = Math.ceil(s.maxHp / 2);
    fb.fx?.push('revive');
    fb.alert = `La Calavera de la suerte te ramène sur le chemin avec ${s.hp} PV !`;
  }

  /** L'ennemi exécute son intention, quoi qu'ait fait l'élève. */
  private enemyActs(fb: Feedback, v: Verdict) {
    const s = this.state, c = s.combat!, e = this.enemy!, it = c.intent, tr = this.traits();
    if (c.canceled) {
      fb.fx.push('canceled');
      fb.enemyLines.push(`L'encens apaise ${e.name} : il ne fait rien ce tour-ci.`);
      return;
    }
    const a = s.ascension;
    const ascAtk = (a >= 4 && e.kind === 'elite' ? 1 : 0) + (a >= 10 && e.kind === 'final' ? 1 : 0);
    const attacks = it.kind === 'attack' || it.kind === 'rush' || it.kind === 'fog' || it.kind === 'listen';
    if (attacks) {
      let dmg = (it.kind === 'attack' ? it.value ?? e.attack : e.attack) + c.attackBonus + ascAtk + (this.relicCount('slowTime') ? 1 : 0);
      if (c.juicio && v === 'ko') {
        dmg *= 2;
        fb.enemyLines.push('Juicio raté : la sentence est doublée !');
      }
      const shieldId = Object.keys(s.inv).find(id => s.inv[id] > 0 && this.itemById.get(id)?.effect === 'autoShield');
      if (c.pshield >= dmg) {
        c.pshield -= dmg;
        fb.fx.push('blocked');
        fb.enemyLines.push(`${e.name} attaque (${dmg}) : ton bouclier encaisse tout.`);
      } else if (shieldId) {
        s.inv[shieldId]--;
        fb.fx.push('blocked');
        fb.enemyLines.push(`Ton ${this.itemById.get(shieldId)!.name} bloque l'attaque de ${e.name}.`);
        if (this.isUpgraded(shieldId)) {
          c.hp = Math.max(0, c.hp - 2);
          fb.dmgToEnemy += 2;
          fb.fx.push('reflect');
          fb.enemyLines.push(`Il renvoie 2 dégâts à ${e.name} !`);
        }
      } else if (this.relicCount('firstErrorShield') && !c.firstErrorUsed) {
        c.firstErrorUsed = true;
        fb.fx.push('mask');
        fb.enemyLines.push('Ta Máscara encaisse la première attaque du combat : aucun dégât.');
      } else {
        const through = dmg - c.pshield;
        if (c.pshield > 0) fb.enemyLines.push(`Ton bouclier encaisse ${c.pshield} dégât${c.pshield > 1 ? 's' : ''}.`);
        c.pshield = 0;
        s.hp = Math.max(0, s.hp - through);
        fb.dmgToPlayer += through;
        fb.fx.push('playerHit');
        fb.enemyLines.push(`${e.name} t'inflige ${through} dégât${through > 1 ? 's' : ''}.`);
      }
    }
    if (it.kind === 'heal') {
      const h = Math.min(c.maxHp - c.hp, it.value ?? 2);
      if (h > 0) {
        c.hp += h;
        fb.fx.push('heal');
        fb.enemyLines.push(`${e.name} se soigne de ${h} PV.`);
      } else fb.enemyLines.push(`${e.name} mange, mais sa vie est déjà pleine.`);
    }
    if (it.kind === 'shield') {
      fb.fx.push('enemyShield');
      fb.enemyLines.push(`${e.name} prie : son bouclier est à ${c.shield}.`);
    }
    if (it.kind === 'steal') {
      const g = Math.min(s.gold, it.value ?? 2);
      if (g > 0) {
        s.gold -= g;
        fb.fx.push('steal');
        fb.enemyLines.push(`${e.name} te vole ${g} 🪙.`);
      } else fb.enemyLines.push(`${e.name} fouille tes poches : rien à voler !`);
    }
    if (it.kind === 'stealItem') {
      const owned = Object.keys(s.inv).filter(id => s.inv[id] > 0);
      if (owned.length) {
        const id = this.rng.pick(owned);
        s.inv[id]--;
        fb.fx.push('stealItem');
        fb.enemyLines.push(`${e.name} te vole un pouvoir : ${this.itemById.get(id)?.name ?? id}.`);
      } else fb.enemyLines.push(`${e.name} fouille ta bolsa : elle est vide.`);
    }
    if (it.kind === 'poison') {
      s.poison += it.value ?? 3;
      fb.fx.push('poison');
      fb.enemyLines.push(`Tu es empoisonné·e : −1 PV par tour pendant ${s.poison} tours.`);
    }
    if (tr.has('crescendo')) {
      if (c.rowCorrect >= 2) {
        if (c.attackBonus > 0) fb.enemyLines.push('Deux bonnes réponses de suite : la musique se calme.');
        c.attackBonus = 0;
        c.rowCorrect = 0;
      } else c.attackBonus = Math.min(4, c.attackBonus + 1);
    }
  }

  private logError(q: Question, given: string | null) {
    const s = this.state;
    if (s.errors.some(e => e.id === q.id)) return;
    s.errors.push({
      id: q.id,
      prompt: `${q.label ? q.label + ' · ' : ''}${q.prompt}`,
      answer: isChoice(q) || q.type === 'ordre' ? fillBlanks(q.prompt, q.answer) : answerText(q, this.content.scenes),
      explanation: q.explanation,
      given: givenText(q, given, this.content.scenes),
    });
  }

  /** Passe à la suite après le résultat du tour. */
  proceed() {
    const s = this.state, c = s.combat;
    if (s.screen !== 'combat' || !c || c.stage !== 'resolve' || !c.fb) return;
    if (s.hp <= 0) return this.end(false);
    if (c.hp <= 0) return this.winFight();
    this.nextTurn();
    this.commit();
  }

  private winFight() {
    const s = this.state, e = this.enemy!;
    s.stats.won++;
    if (!s.defeated.includes(e.id)) s.defeated.push(e.id);
    if (this.state.combat && this.state.combat.errors === 0) s.stats.perfectFights++;
    s.gold += (e.kind === 'normal' ? 3 : e.kind === 'elite' ? 5 : 8) - (s.ascension >= 5 ? 1 : 0);
    const h = this.relicValue('healAfterFight', 2);
    if (h) s.hp = Math.min(s.maxHp, s.hp + h);
    s.poison = 0;
    if (e.kind === 'final') return this.end(true);
    if (e.kind === 'jefe') {
      s.hp = Math.min(s.maxHp, s.hp + Math.ceil(s.maxHp * 0.25));
      s.offer = this.rollOffer('jefe');
      s.offerKind = 'jefe';
      s.cardOffer = null;
    } else {
      s.offerKind = e.kind === 'elite' ? 'elite' : 'normal';
      s.offer = e.kind === 'elite' ? this.rollOffer('elite') : null;
      s.cardOffer = this.rollCards(3).map(id => ({ id }));
    }
    s.screen = 'reward';
    s.combat = null;
    this.commit();
  }

  /* ======================= Cartes : récompenses, tianguis, ofrenda ======================= */

  /** Tire n cartes différentes à proposer. Les Saberes déjà possédés ne sont pas reproposés. */
  private rollCards(n: number): string[] {
    const owned = new Set(this.state.deck.map(d => d.id));
    const pool = this.content.cards.filter(c => (c.family === 'golpe' || c.family === 'saber') && !(c.once && owned.has(c.id)));
    const out: string[] = [];
    let rest = pool;
    while (out.length < n && rest.length) {
      const c = this.rng.weighted(rest, x => RARITY_WEIGHT[x.rarity]);
      out.push(c.id);
      rest = rest.filter(x => x.id !== c.id);
    }
    return out;
  }

  private addCard(id: string, up?: CardInst['up']): CardInst | null {
    if (!this.cardById.has(id)) return null;
    const s = this.state;
    const inst: CardInst = { uid: s.nextUid++, id };
    if (up) inst.up = up;
    s.deck.push(inst);
    return inst;
  }

  /** Récompense : prendre la carte n°i (ou passer si i < 0). */
  takeCard(i: number) {
    const s = this.state;
    if (s.screen !== 'reward' || !s.cardOffer) return;
    if (i >= 0 && s.cardOffer[i]) this.addCard(s.cardOffer[i].id);
    s.cardOffer = null;
    if (!s.offer) this.toMap();
    this.commit();
  }

  /** Récompense : prendre l'objet n°i (ou passer si i < 0). */
  take(i: number) {
    const s = this.state;
    if (s.screen !== 'reward' || !s.offer) return;
    if (i >= 0 && s.offer[i]) this.gain(s.offer[i].id);
    s.offer = null;
    if (s.offerKind === 'jefe') this.nextAct();
    else if (!s.cardOffer) this.toMap();
    this.commit();
  }

  /** Tianguis : acheter la carte n°i. */
  buyCard(i: number): boolean {
    const s = this.state, o = s.cardOffer?.[i];
    const card = o && this.cardById.get(o.id);
    if (s.screen !== 'shop' || !o || o.sold || !card || s.gold < card.price) return false;
    s.gold -= card.price;
    this.addCard(card.id);
    o.sold = true;
    this.commit();
    return true;
  }

  /** Tianguis : retirer une carte de la baraja (il en faut au moins 5). */
  removeCard(uid: number): boolean {
    const s = this.state;
    if (s.screen !== 'shop' || s.gold < REMOVE_CARD_PRICE || s.deck.length <= 5 || !s.deck.some(c => c.uid === uid)) return false;
    s.gold -= REMOVE_CARD_PRICE;
    s.deck = s.deck.filter(c => c.uid !== uid);
    this.commit();
    return true;
  }

  /** Cartes qui peuvent encore être améliorées. */
  upgradableCards(): CardInst[] {
    return this.state.deck.filter(c => !c.up && this.cardById.has(c.id));
  }

  /** Ofrenda : améliorer une carte, « plus forte » ou « a la pluma » (défi à l'écrit, effet doublé). */
  restUpgradeCard(uid: number, up: 'fuerte' | 'pluma') {
    const s = this.state;
    const inst = s.deck.find(c => c.uid === uid);
    if (s.screen !== 'rest' || !s.rest || s.rest.result || !inst || inst.up) return;
    if (up === 'pluma' && this.settings.writeFactor <= 0) return;
    const card = this.cardById.get(inst.id)!;
    if (up === 'fuerte' && !card.upgrade) return;
    inst.up = up;
    s.rest.result = {
      text: `Tu déposes ${card.name} sur la ofrenda. La carte brille…`,
      lines: [up === 'fuerte' ? `${instName(card, inst)} : ${this.describe(effectsOf(card, inst))}` : `${instName(card, inst)} : le défi se fait à l'écrit, l'effet est doublé (${this.describe(scaleEffects(card.effects, 2))}).`],
    };
    this.commit();
  }

  /* ======================= Objets ======================= */

  private idByEffect(effect: Item['effect']): string | undefined {
    return this.content.items.find(i => i.effect === effect)?.id;
  }

  /** Objets encore obtenables d'une catégorie. */
  available(kind: Item['kind']): string[] {
    // sans chrono, les objets qui ne servent qu'au chrono ne sont plus proposés
    const useless = (i: Item) => !this.settings.chrono && (i.effect === 'time' || i.effect === 'slowTime');
    return this.content.items
      .filter(i => i.kind === kind && !useless(i) && (kind === 'aide' || (this.state.relics[i.id] ?? 0) < (i.max ?? 1)))
      .map(i => i.id);
  }

  private pickItems(ids: string[], n: number, weights: Record<Rarity, number>): string[] {
    const out: string[] = [];
    let pool = [...ids];
    while (out.length < n && pool.length) {
      const id = this.rng.weighted(pool, x => weights[this.itemById.get(x)!.rarity]);
      out.push(id);
      pool = pool.filter(x => x !== id);
    }
    return out;
  }

  private rollOffer(kind: 'normal' | 'elite' | 'jefe'): Offer[] {
    const n = 3 + this.relicCount('extraChoice');
    if (kind !== 'normal') {
      const r = this.pickItems(this.available('reliquia'), n, kind === 'jefe' ? BOSS_RARITY_WEIGHT : RARITY_WEIGHT);
      return (r.length ? r : this.pickItems(this.available('aide'), n, RARITY_WEIGHT)).map(id => ({ id }));
    }
    const mix = [...this.pickItems(this.available('aide'), 2, RARITY_WEIGHT), ...this.pickItems(this.available('reliquia'), 2, RARITY_WEIGHT)];
    const extra = this.pickItems(this.available('aide').filter(id => !mix.includes(id)), n - 3, RARITY_WEIGHT);
    return this.rng.shuffle([...mix, ...extra]).slice(0, n).map(id => ({ id }));
  }

  private gain(id: string) {
    const it = this.itemById.get(id)!;
    const s = this.state;
    if (!s.obtained.includes(id)) s.obtained.push(id);
    if (it.kind === 'reliquia') {
      s.relics[id] = (s.relics[id] ?? 0) + 1;
      if (it.effect === 'maxHp') {
        s.maxHp += it.value ?? 4;
        s.hp += it.value ?? 4;
      }
    } else s.inv[id] = (s.inv[id] ?? 0) + 1;
  }

  private gainRandom(kind: Item['kind'], rarity?: Rarity): string | null {
    let ids = this.available(kind);
    if (rarity) {
      const r = ids.filter(id => this.itemById.get(id)!.rarity === rarity);
      if (r.length) ids = r;
    }
    if (!ids.length) return null;
    const id = this.rng.weighted(ids, x => RARITY_WEIGHT[this.itemById.get(x)!.rarity]);
    this.gain(id);
    return id;
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

  buyMeal(): boolean {
    const s = this.state, meal = this.content.sequence.meal;
    if (s.screen !== 'shop' || s.gold < meal.price || s.hp >= s.maxHp) return false;
    s.gold -= meal.price;
    s.hp = Math.min(s.maxHp, s.hp + meal.heal);
    this.commit();
    return true;
  }

  leaveShop() {
    if (this.state.screen !== 'shop') return;
    this.toMap();
    this.commit();
  }

  /* ======================= Ofrenda (repos) ======================= */

  restHealAmount(): number {
    const s = this.state;
    return Math.ceil(s.maxHp * Math.max(0.1, s.bonus.restHeal - (s.ascension >= 6 ? 0.1 : 0)));
  }

  /** Aides possédées qui peuvent être améliorées. */
  upgradable(): string[] {
    return Object.keys(this.state.inv).filter(id => this.state.inv[id] > 0 && this.itemById.get(id)?.upgrade && !this.state.upgrades[id]);
  }

  restHeal() {
    const s = this.state;
    if (s.screen !== 'rest' || !s.rest || s.rest.result) return;
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + this.restHealAmount());
    s.rest.result = { text: 'Tu te reposes près de la ofrenda.', lines: [`+${s.hp - before} PV`] };
    this.commit();
  }

  restUpgrade(id: string) {
    const s = this.state;
    if (s.screen !== 'rest' || !s.rest || s.rest.result || !this.upgradable().includes(id)) return;
    s.upgrades[id] = true;
    const it = this.itemById.get(id)!;
    s.rest.result = { text: `Tu déposes ton ${it.name} sur la ofrenda. Il brille…`, lines: [it.upgrade ?? `${it.name} amélioré`] };
    this.commit();
  }

  /* ======================= Coffre ======================= */

  chestOpen() {
    const s = this.state, ch = s.chest;
    if (s.screen !== 'chest' || !ch || ch.result || ch.quiz) return;
    if (ch.locked) ch.quiz = this.makeQuiz({ write: true });
    else ch.result = { text: 'Le coffre s\'ouvre.', lines: this.loot(false) };
    this.commit();
  }

  chestAnswer(value: string) {
    const s = this.state, ch = s.chest;
    if (s.screen !== 'chest' || !ch?.quiz || ch.result) return;
    const v = this.answerQuiz(ch.quiz, value);
    if (!v) return;
    ch.result = v === 'ko'
      ? { text: 'Le cadenas résiste. Tu récupères quelques monedas tombées par terre.', lines: this.applyEffects([{ type: 'gold', value: 2 }]) }
      : { text: 'Le cadenas s\'ouvre ! Ce coffre cachait un trésor.', lines: this.loot(true) };
    this.commit();
  }

  private loot(rich: boolean): string[] {
    const lines: string[] = [];
    if (rich || this.rng.chance(0.55)) {
      const id = this.gainRandom('reliquia', rich ? (this.rng.chance(0.3) ? 'legendaria' : 'rara') : undefined);
      if (id) lines.push(`Nouvelle relique : ${this.itemById.get(id)!.emoji} ${this.itemById.get(id)!.name}`);
    }
    if (!lines.length) {
      for (let k = 0; k < 2; k++) {
        const id = this.gainRandom('aide');
        if (id) lines.push(`Nouvelle aide : ${this.itemById.get(id)!.emoji} ${this.itemById.get(id)!.name}`);
      }
    }
    lines.push(...this.applyEffects([{ type: 'gold', value: 2 + this.rng.int(4) }]));
    return lines;
  }

  /* ======================= Événements ======================= */

  /** Le choix n°i est-il possible ? Renvoie la raison sinon. */
  choiceBlock(i: number): string | null {
    const ev = this.currentEvent, ch = ev?.choices[i];
    if (!ch) return 'inconnu';
    const r = ch.require;
    if (r?.gold && this.state.gold < r.gold) return `il faut ${r.gold} monedas`;
    if (r?.aide && Object.values(this.state.inv).reduce((a, b) => a + b, 0) < r.aide) return 'il faut une aide';
    return null;
  }

  eventChoose(i: number) {
    const s = this.state, st = s.event, ev = this.currentEvent;
    if (s.screen !== 'event' || !st || !ev || st.choice !== null || this.choiceBlock(i)) return;
    st.choice = i;
    const ch = ev.choices[i];
    if (ch.quiz) st.quiz = this.makeQuiz({ themes: ch.quiz.themes, write: ch.quiz.write });
    else this.resolveEvent(ch.outcome!);
    this.commit();
  }

  eventAnswer(value: string) {
    const s = this.state, st = s.event, ev = this.currentEvent;
    if (s.screen !== 'event' || !st?.quiz || !ev || st.choice === null || st.result) return;
    const v = this.answerQuiz(st.quiz, value);
    if (!v) return;
    const ch = ev.choices[st.choice];
    this.resolveEvent(v === 'ko' ? ch.failure! : ch.success!);
    this.commit();
  }

  private resolveEvent(o: EventOutcome) {
    const st = this.state.event!;
    const lines = this.applyEffects(o.effects);
    let text = o.text, textFr = o.textFr;
    const fight = o.effects.find(e => e.type === 'fight');
    if (fight && fight.type === 'fight') st.pendingFight = fight.kind;
    // un tirage au sort ajoute son propre texte
    const extra = lines.filter(l => l.startsWith('§')).map(l => l.slice(1));
    if (extra.length) {
      const [es, fr] = extra[0].split('¦');
      text += ' ' + es;
      if (textFr && fr) textFr += ' ' + fr;
    }
    st.result = { text, textFr, lines: lines.filter(l => !l.startsWith('§')) };
  }

  /** Quitte l'événement : retour à la carte ou combat déclenché par le choix. */
  eventContinue() {
    const s = this.state, st = s.event;
    if (s.screen !== 'event' || !st?.result) return;
    if (st.pendingFight) this.startFight(this.pickEnemy(st.pendingFight));
    else this.toMap();
    this.commit();
  }

  /** Continue après une salle sans combat (coffre, repos). */
  roomContinue() {
    const s = this.state;
    if ((s.screen === 'chest' && s.chest?.result) || (s.screen === 'rest' && s.rest?.result)) {
      this.toMap();
      this.commit();
    }
  }

  /** Applique les effets d'un événement. Renvoie des lignes lisibles (en français). */
  private applyEffects(effects: EventEffect[]): string[] {
    const s = this.state, out: string[] = [];
    for (const e of effects) {
      switch (e.type) {
        case 'hp': {
          const before = s.hp;
          s.hp = Math.max(1, Math.min(s.maxHp, s.hp + e.value));
          if (s.hp !== before) out.push(`${s.hp > before ? '+' : '−'}${Math.abs(s.hp - before)} PV`);
          break;
        }
        case 'maxHp':
          s.maxHp = Math.max(1, s.maxHp + e.value);
          s.hp = Math.min(s.hp, s.maxHp);
          out.push(`${e.value > 0 ? '+' : '−'}${Math.abs(e.value)} PV maximum`);
          break;
        case 'gold': {
          const d = Math.max(-s.gold, e.value);
          s.gold += d;
          if (d) out.push(`${d > 0 ? '+' : '−'}${Math.abs(d)} 🪙`);
          break;
        }
        case 'item': {
          let id: string | null = null;
          if (e.id) {
            const it = this.itemById.get(e.id);
            if (it && (it.kind === 'aide' || (s.relics[e.id] ?? 0) < (it.max ?? 1))) {
              this.gain(e.id);
              id = e.id;
            } else if (it) {
              out.push(...this.applyEffects([{ type: 'gold', value: 5 }]));
              break;
            }
          } else id = this.gainRandom(e.kind ?? 'aide', e.rarity);
          if (id) {
            const it = this.itemById.get(id)!;
            out.push(`${it.kind === 'reliquia' ? 'Nouvelle relique' : 'Nouvelle aide'} : ${it.emoji} ${it.name}`);
          }
          break;
        }
        case 'loseItem': {
          const owned = Object.keys(s.inv).filter(id => s.inv[id] > 0);
          if (owned.length) {
            const id = this.rng.pick(owned);
            s.inv[id]--;
            out.push(`Tu donnes : ${this.itemById.get(id)?.name ?? id}`);
          }
          break;
        }
        case 'upgrade': {
          const ids = this.upgradable();
          if (ids.length) {
            const id = this.rng.pick(ids);
            s.upgrades[id] = true;
            out.push(this.itemById.get(id)!.upgrade ?? `${this.itemById.get(id)!.name} amélioré`);
          } else {
            // pas d'aide à améliorer : une carte le devient
            const cards = this.upgradableCards().filter(c => this.cardById.get(c.id)?.upgrade);
            if (cards.length) {
              const inst = this.rng.pick(cards);
              inst.up = 'fuerte';
              out.push(`${instName(this.cardById.get(inst.id)!, inst)} : ${this.describe(effectsOf(this.cardById.get(inst.id)!, inst))}`);
            } else out.push(...this.applyEffects([{ type: 'gold', value: 4 }]));
          }
          break;
        }
        case 'fight':
          break;
        case 'random': {
          const o = this.rng.pick(e.outcomes);
          out.push(`§${o.text}¦${o.textFr ?? ''}`, ...this.applyEffects(o.effects));
          break;
        }
      }
    }
    return out;
  }

  /* ======================= Pouvoirs ======================= */

  usePower(id: string): boolean {
    if (this.powerBlock(id)) return false;
    this.state.stats.powersUsed++;
    const s = this.state, c = s.combat, it = this.itemById.get(id)!, q = this.question;
    const up = this.isUpgraded(id);
    const consume = () => {
      if (s.inv[id] > 0) s.inv[id]--;
      else if (it.effect === 'translate' && c) c.freeTranslateUsed = true;
    };
    switch (it.effect) {
      case 'heal':
        s.hp = Math.min(s.maxHp, s.hp + (it.value ?? 5) + (up ? 3 : 0));
        break;
      case 'translate':
        c!.used.translate = true;
        if (up) c!.used.hint = true;
        break;
      case 'hint':
        c!.used.hint = true;
        break;
      case 'scissors':
        c!.used.scissors = true;
        if (c!.q.mode === 'qcm' && isChoice(q!)) c!.hidden = this.rng.shuffle(c!.q.options.filter(o => o !== q!.answer)).slice(0, 2);
        else if (c!.q.mode === 'write' && isChoice(q!)) c!.mask = maskAnswer(q!.answer);
        else c!.mask = scissorsHint(q!, this.content.scenes);
        if (up && c!.timeMax) {
          c!.timeLeft += 10000;
          c!.timeMax = Math.max(c!.timeMax, c!.timeLeft);
        }
        break;
      case 'time':
        c!.timeLeft += ((it.value ?? 15) + (up ? 10 : 0)) * 1000;
        c!.timeMax = Math.max(c!.timeMax, c!.timeLeft);
        break;
      case 'cancelIntent':
        c!.canceled = true;
        c!.fog = false;
        if (up) c!.shield = 0;
        break;
      case 'swap':
        consume();
        if (c!.stage === 'hand') {
          // Cambio en main : une nouvelle main
          this.deal();
        } else this.ask(this.playedCard, true, up);
        this.commit();
        return true;
      case 'oracle':
        consume();
        this.answer(canonicalValue(q!), 'oracle');
        return true;
      default:
        return false;
    }
    consume();
    this.commit();
    return true;
  }

  /** Texte du Traductor : la traduction de l'énoncé ; s'il n'y a rien à traduire, la première lettre de la réponse. */
  translationText(): string {
    const q = this.question;
    if (!q) return '';
    if (q.translation) return q.translation;
    return isChoice(q) ? autoHint(q.answer) : '';
  }

  /** Texte de l'antisèche : la règle, sauf si elle dévoile la réponse. */
  hintText(): string {
    const q = this.question;
    if (!q) return '';
    // vrai / faux : l'explication commence par la réponse ; l'antisèche aide seulement à comprendre la phrase
    if (q.type === 'vrai-faux') return q.translation ? `En français : ${q.translation}` : 'Relis chaque mot : un seul détail peut rendre la phrase fausse.';
    const ans = answerText(q, this.content.scenes);
    const leaks = isChoice(q) && normalize(q.explanation).includes(normalize(ans));
    const hintId = this.idByEffect('hint');
    const auto = isChoice(q) || q.type === 'ordre' ? autoHint(ans) : '';
    if (hintId && this.isUpgraded(hintId)) return leaks ? auto : `${q.explanation} ${auto}`.trim();
    return leaks ? auto : q.explanation;
  }

  /** Ce que l'ennemi annonce pour ce tour : phrase en espagnol, icône, détail en français. */
  intentInfo(): { es: string; ico: string; text: string; sub: string; dmg: number } {
    const c = this.state.combat!, e = this.enemy!, it = c.intent;
    const t = this.content.sequence.intents[it.kind] ?? { es: 'Está preparando algo', ico: '❔' };
    const a = this.state.ascension;
    const ascAtk = (a >= 4 && e.kind === 'elite' ? 1 : 0) + (a >= 10 && e.kind === 'final' ? 1 : 0);
    const base = e.attack + c.attackBonus + ascAtk + (this.relicCount('slowTime') ? 1 : 0);
    const dmg = (it.kind === 'attack' ? (it.value ?? e.attack) + c.attackBonus + ascAtk + (this.relicCount('slowTime') ? 1 : 0) : base);
    switch (it.kind) {
      case 'attack': return { es: t.es, ico: t.ico, dmg, text: `Attaque ${dmg}`, sub: c.juicio ? `Juicio : si tu rates, ${dmg * 2} dégâts ; si tu réussis, son bouclier tombe` : `${dmg} dégâts à la fin du tour, sauf bouclier` };
      case 'shield': return { es: t.es, ico: t.ico, dmg: 0, text: `Bouclier +${it.value ?? 2}`, sub: 'il se protège : pas d’attaque ce tour' };
      case 'heal': return { es: t.es, ico: t.ico, dmg: 0, text: `Soin +${it.value ?? 2}`, sub: 'il se soigne à la fin du tour : pas d’attaque' };
      case 'steal': return { es: t.es, ico: t.ico, dmg: 0, text: `Vol de ${it.value ?? 2} monedas`, sub: 'pas d’attaque ce tour' };
      case 'rush': return { es: t.es, ico: t.ico, dmg, text: `Attaque ${dmg} · chrono −${it.value ?? 5} s`, sub: 'le défi est plus court' };
      case 'poison': return { es: t.es, ico: t.ico, dmg: 0, text: `Poison ${it.value ?? 3}`, sub: '−1 PV par tour, pas d’attaque ce tour' };
      case 'fog': return { es: t.es, ico: t.ico, dmg, text: `Attaque ${dmg} · brouillard`, sub: 'tes aides sont bloquées ce tour' };
      case 'stealItem': return { es: t.es, ico: t.ico, dmg: 0, text: 'Vol d’une aide', sub: 'pas d’attaque ce tour' };
      case 'listen': return { es: t.es, ico: t.ico, dmg, text: `Attaque ${dmg} · canto`, sub: 'le défi est à écouter' };
    }
  }

  /** Dégâts qu'une carte de la main ferait à l'ennemi maintenant (pour les infobulles et le robot). */
  previewDamage(hc: HandCard): number {
    return damageOf(hc.effects, this.state.streak) + (damageOf(hc.effects) > 0 ? this.relicValue('damageBonus') : 0);
  }

  /* ======================= Fin ======================= */

  private end(win: boolean) {
    const s = this.state;
    s.screen = 'over';
    s.result = win ? 'win' : 'lose';
    s.stats.endedAt = Date.now();
    this.commit();
  }

  /** Abandon volontaire. */
  abandon() {
    this.end(false);
  }
}
