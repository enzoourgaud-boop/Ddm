/** Bot de simulation : joue des parties entières sans interface (tests et équilibrage). */
import { canonicalValue, wrongValue } from '../src/engine/questions';
import { DEFAULT_SETTINGS, Game, type HandCard, type QuizState, type Settings } from '../src/engine/game';
import { healOf, shieldOf } from '../src/engine/combat/cards';
import { Rng } from '../src/engine/rng';
import type { Content } from '../src/engine/schema';

export interface SimResult {
  win: boolean;
  won: number;
  minutes: number;
  answers: number;
  act: number;
  rooms: Record<string, number>;
  /** Identifiants des questions posées, dans l'ordre (échauffement compris). */
  asked: string[];
  freed: number;
  warmup: number;
  maxHp: number;
}

export interface SimOptions {
  /** Questions ratées aux parties précédentes (« almas pendientes »). */
  pending?: string[];
  /** Branche des observateurs sur la partie (révision de Leitner, par exemple). */
  attach?: (g: Game) => void;
}

/** Durées estimées d'un élève de 5e (secondes). */
export const T = { qcm: 9, write: 16, tf: 7, order: 18, match: 15, place: 20, feedback: 4, reward: 10, shop: 25, map: 4, event: 25, rest: 8, chest: 8, hand: 4, resolveOk: 2 };

/**
 * Choix de carte d'un élève raisonnable : achever l'ennemi si possible, se protéger d'une grosse attaque,
 * se soigner quand la vie baisse, sinon frapper le plus fort.
 */
export function chooseCard(g: Game, hand: HandCard[]): number {
  const s = g.state, c = s.combat!, info = g.intentInfo();
  const incoming = info.dmg;
  let best = 0, bestScore = -Infinity;
  hand.forEach((hc, i) => {
    const dmg = g.previewDamage(hc), sh = shieldOf(hc.effects), heal = healOf(hc.effects);
    let score = dmg * 2;
    if (dmg >= c.hp + c.shield && dmg > 0) score += 100;
    if (incoming > 0) score += Math.min(sh, incoming) * (incoming >= s.hp * 0.4 ? 4 : 1.5);
    else score += sh * 0.2;
    score += heal * (s.hp < s.maxHp * 0.5 ? 2.5 : 0.3);
    if (hc.effects.some(e => e.do === 'double') && c.turn <= 2) score += 6;
    if (hc.effects.some(e => e.do === 'cleanse') && (c.shield > 0 || c.abanico > 0)) score += 8;
    if (hc.effects.some(e => e.do === 'strike') && c.shield > 0) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function simulate(content: Content, seed: string, accuracy: number, settings: Settings = { ...DEFAULT_SETTINGS }, opts: SimOptions = {}): SimResult {
  const g = Game.newRun(content, settings, seed, 0, { pending: opts.pending });
  opts.attach?.(g);
  const bot = new Rng(`bot-${seed}-${accuracy}`);
  let sec = 0, answers = 0, guard = 0, warmup = 0;
  const rooms: Record<string, number> = {};
  const asked: string[] = [];
  const reply = (quiz: { q: QuizState['q'] }) => {
    const q = g.getQuestion(quiz.q.id)!;
    asked.push(q.id);
    answers++;
    sec += T[quiz.q.mode];
    if (bot.chance(accuracy)) return canonicalValue(q);
    return wrongValue(q, quiz.q.options);
  };
  while (g.state.screen !== 'over' && guard++ < 20000) {
    const s = g.state;
    switch (s.screen) {
      case 'warmup': {
        const w = s.warmup!;
        if (w.quiz.fb) {
          g.warmupNext();
          sec += T.feedback;
        } else {
          warmup++;
          g.warmupAnswer(reply(w.quiz));
        }
        break;
      }
      case 'map': {
        const n = bot.pick(g.reachable());
        rooms[n.type] = (rooms[n.type] ?? 0) + 1;
        g.choose(n.id);
        sec += T.map;
        break;
      }
      case 'combat': {
        const c = s.combat!;
        if (c.stage === 'resolve') {
          sec += c.fb && (c.fb.outcome === 'ok' || c.fb.outcome === 'oracle') ? T.resolveOk : T.feedback;
          g.proceed();
          break;
        }
        if (c.stage === 'hand') {
          if (s.hp <= 8 && (s.inv.chocolate ?? 0) > 0) g.usePower('chocolate');
          sec += T.hand;
          g.play(chooseCard(g, g.hand()));
          break;
        }
        g.answer(reply(c));
        break;
      }
      case 'reward':
        if (s.cardOffer) g.takeCard(0);
        else g.take(0);
        sec += T.reward;
        break;
      case 'shop':
        if (s.hp < s.maxHp * 0.6) while (g.buyMeal());
        for (let i = 0; i < (s.cardOffer?.length ?? 0); i++) g.buyCard(i);
        for (let i = 0; i < (s.offer?.length ?? 0); i++) g.buy(i);
        while (g.buyMeal());
        g.leaveShop();
        sec += T.shop;
        break;
      case 'rest':
        if (s.rest!.result) g.roomContinue();
        else {
          const up = g.upgradable(), cards = g.upgradableCards();
          if (s.hp < s.maxHp * 0.7 || (!up.length && !cards.length)) g.restHeal();
          else if (cards.length) g.restUpgradeCard(cards[0].uid, bot.chance(0.5) && settings.writeFactor > 0 ? 'pluma' : 'fuerte');
          else g.restUpgrade(up[0]);
          sec += T.rest;
        }
        break;
      case 'chest': {
        const ch = s.chest!;
        if (ch.result) g.roomContinue();
        else if (ch.quiz) g.chestAnswer(reply(ch.quiz));
        else {
          g.chestOpen();
          sec += T.chest;
        }
        break;
      }
      case 'event': {
        const st = s.event!;
        if (st.result) g.eventContinue();
        else if (st.quiz) g.eventAnswer(reply(st.quiz));
        else {
          const ev = g.currentEvent!;
          const ok = ev.choices.map((_, i) => i).filter(i => !g.choiceBlock(i));
          g.eventChoose(bot.pick(ok));
          sec += T.event;
        }
        break;
      }
    }
  }
  return { win: g.state.result === 'win', won: g.state.stats.won, minutes: sec / 60, answers, act: g.state.act, rooms, asked, freed: g.state.stats.freed ?? 0, warmup, maxHp: g.state.maxHp };
}
