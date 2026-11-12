/** Bot de simulation : joue des parties entières sans interface (tests et équilibrage). */
import { DEFAULT_SETTINGS, Game, type Settings } from '../src/engine/game';
import { Rng } from '../src/engine/rng';
import type { Content } from '../src/engine/schema';

export interface SimResult {
  win: boolean;
  won: number;
  minutes: number;
  answers: number;
  act: number;
}

/** Durées estimées d'un élève de 5e (secondes). */
const T = { qcm: 9, write: 16, feedback: 4, reward: 10, shop: 25 };

export function simulate(content: Content, seed: string, accuracy: number, settings: Settings = { ...DEFAULT_SETTINGS }): SimResult {
  const g = Game.newRun(content, settings, seed, 0);
  const bot = new Rng(`bot-${seed}-${accuracy}`);
  let sec = 0, answers = 0, guard = 0;
  while (g.state.screen !== 'over' && guard++ < 20000) {
    const s = g.state;
    if (s.screen === 'combat') {
      const c = s.combat!;
      if (c.fb) {
        g.proceed();
        sec += T.feedback;
        continue;
      }
      // utilise le Chocolate si la vie est basse
      if (s.hp <= 4 && (s.inv.chocolate ?? 0) > 0) g.usePower('chocolate');
      const q = g.question!;
      const right = bot.chance(accuracy);
      const value = right ? q.answer : c.q.mode === 'qcm' ? c.q.options.find(o => o !== q.answer)! : 'no sé';
      g.answer(value);
      answers++;
      sec += c.q.mode === 'write' ? T.write : T.qcm;
    } else if (s.screen === 'reward') {
      g.take(0);
      sec += T.reward;
    } else if (s.screen === 'shop') {
      for (let i = 0; i < (s.offer?.length ?? 0); i++) g.buy(i);
      while (g.buyMeal());
      g.leaveShop();
      sec += T.shop;
    }
  }
  return { win: g.state.result === 'win', won: g.state.stats.won, minutes: sec / 60, answers, act: g.state.act };
}
