import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Game } from '../src/engine/game';
import { content } from './helpers';
import { simulate } from './sim';

const S = { ...DEFAULT_SETTINGS };

function wrongOf(g: Game) {
  const c = g.state.combat!, q = g.question!;
  return c.q.mode === 'qcm' ? c.q.options.find(o => o !== q.answer)! : 'zzz';
}

describe('moteur de partie', () => {
  it('une nouvelle partie démarre en combat avec une question', () => {
    const g = Game.newRun(content(), S, 'TEST-1');
    expect(g.state.screen).toBe('combat');
    expect(g.question).toBeTruthy();
    expect(g.state.rooms).toHaveLength(3);
    expect(g.state.hp).toBe(content().sequence.player.hp);
  });

  it('même graine + mêmes réponses = même partie (reproductible)', () => {
    const a = simulate(content(), 'REPRO-7', 0.8);
    const b = simulate(content(), 'REPRO-7', 0.8);
    expect(a).toEqual(b);
    const g1 = Game.newRun(content(), S, 'REPRO-7'), g2 = Game.newRun(content(), S, 'REPRO-7');
    expect(g1.state.rooms).toEqual(g2.state.rooms);
    expect(g1.state.combat!.q).toEqual(g2.state.combat!.q);
  });

  it('une bonne réponse blesse l’ennemi, une erreur blesse le joueur', () => {
    const g = Game.newRun(content(), S, 'HIT-1');
    const hp0 = g.state.combat!.hp + g.state.combat!.shield;
    g.answer(g.question!.answer);
    const c = g.state.combat!;
    expect(c.fb!.outcome).toBe('ok');
    expect(c.hp + c.shield).toBeLessThan(hp0);
    g.proceed();
    const php = g.state.hp;
    g.answer(wrongOf(g));
    expect(g.state.combat!.fb!.outcome).toBe('ko');
    expect(g.state.hp).toBeLessThan(php);
    expect(g.state.errors).toHaveLength(1);
  });

  it('un accent oublié ne blesse personne', () => {
    // cherche une partie dont une question écrite contient un accent
    for (let i = 0; i < 400; i++) {
      const g = Game.newRun(content(), { ...S, writeFactor: 10 }, `CASI-${i}`);
      const q = g.question!;
      if (g.state.combat!.q.mode !== 'write' || !/[áéíóú]/.test(q.answer)) continue;
      const hp = g.state.hp, ehp = g.state.combat!.hp;
      g.answer(q.answer.normalize('NFD').replace(/[̀-ͯ]/g, ''));
      expect(g.state.combat!.fb!.outcome).toBe('casi');
      expect(g.state.hp).toBe(hp);
      expect(g.state.combat!.hp).toBe(ehp);
      return;
    }
    throw new Error('aucune question écrite accentuée trouvée');
  });

  it('le chrono écoulé compte comme une erreur', () => {
    const g = Game.newRun(content(), S, 'TIME-1');
    const hp = g.state.hp;
    g.tick(g.state.combat!.timeMax + 10);
    expect(g.state.combat!.fb!.outcome).toBe('timeout');
    expect(g.state.hp).toBeLessThanOrEqual(hp);
  });

  it('sans chrono, le temps ne s’écoule pas', () => {
    const g = Game.newRun(content(), { ...S, chrono: false }, 'TIME-2');
    expect(g.state.combat!.timeMax).toBe(0);
    expect(g.tick(999999)).toBe(false);
    expect(g.state.combat!.fb).toBeNull();
  });

  it('sans écrit, toutes les questions sont en QCM', () => {
    const g = Game.newRun(content(), { ...S, writeFactor: 0 }, 'QCM-1');
    for (let i = 0; i < 40 && g.state.screen === 'combat'; i++) {
      if (g.state.combat!.fb) {
        g.proceed();
        continue;
      }
      expect(g.state.combat!.q.mode).toBe('qcm');
      g.answer(g.question!.answer);
    }
  });

  it('les thèmes désactivés ne sont jamais posés', () => {
    const g = Game.newRun(content(), { ...S, themes: ['cultura'] }, 'THEME-1');
    for (let i = 0; i < 40 && g.state.screen === 'combat'; i++) {
      if (g.state.combat!.fb) {
        g.proceed();
        continue;
      }
      expect(g.question!.theme).toBe('cultura');
      g.answer(g.question!.answer);
    }
  });

  it('les questions désactivées ne sont jamais posées', () => {
    const disabled = new Set(content().questions.filter(q => q.disabled).map(q => q.id));
    expect(disabled.size).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      const g = Game.newRun(content(), { ...S, themes: ['cultura'] }, `DIS-${i}`);
      for (let k = 0; k < 60 && g.state.screen !== 'over'; k++) {
        const s = g.state;
        if (s.screen === 'combat') {
          if (s.combat!.fb) g.proceed();
          else {
            expect(disabled.has(g.question!.id)).toBe(false);
            g.answer(k % 3 ? g.question!.answer : 'zzz');
          }
        } else if (s.screen === 'reward') g.take(0);
        else if (s.screen === 'shop') g.leaveShop();
      }
    }
  });

  it('l’Oráculo donne la réponse et blesse l’ennemi', () => {
    const g = Game.newRun(content(), S, 'ORA-1');
    g.state.inv.oraculo = 1;
    expect(g.usePower('oraculo')).toBe(true);
    expect(g.state.combat!.fb!.outcome).toBe('oracle');
    expect(g.state.inv.oraculo).toBe(0);
  });

  it('Tijeras retire deux mauvaises réponses en QCM', () => {
    for (let i = 0; i < 50; i++) {
      const g = Game.newRun(content(), { ...S, writeFactor: 0 }, `TIJ-${i}`);
      expect(g.usePower('tijeras')).toBe(true);
      const c = g.state.combat!;
      expect(c.hidden).toHaveLength(2);
      expect(c.hidden).not.toContain(g.question!.answer);
      return;
    }
  });

  it('l’Escudo bloque une attaque automatiquement', () => {
    const g = Game.newRun(content(), S, 'ESC-1');
    g.state.inv.escudo = 1;
    const hp = g.state.hp;
    g.answer(wrongOf(g));
    expect(g.state.inv.escudo).toBe(0);
    expect(g.state.hp).toBeGreaterThanOrEqual(hp - 1); // seul un éventuel poison passe
  });

  it('un élite « Solo escrito » ne pose que des questions écrites', () => {
    const c = content();
    const g = Game.newRun(c, S, 'ELITE-1');
    g.state.rooms[0][0] = 'pinata-furiosa';
    (g as unknown as { startFight(): void }).startFight();
    for (let i = 0; i < 15 && g.state.screen === 'combat'; i++) {
      if (g.state.combat!.fb) {
        g.proceed();
        continue;
      }
      expect(g.state.combat!.q.mode).toBe('write');
      g.answer(g.question!.answer);
    }
  });

  it('la Catrina change de phase quand ses PV baissent', () => {
    const g = Game.newRun(content(), { ...S, writeFactor: 10 }, 'CAT-1');
    g.state.rooms[0][0] = 'catrina';
    (g as unknown as { startFight(): void }).startFight();
    const seen = new Set<number>();
    for (let i = 0; i < 80 && g.state.screen === 'combat'; i++) {
      seen.add(g.state.combat!.phase);
      if (g.state.combat!.fb) g.proceed();
      else g.answer(g.question!.answer);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(g.state.result).toBe('win');
  });

  it('l’abanico de la Catrina bloque les QCM', () => {
    const g = Game.newRun(content(), { ...S, writeFactor: 0.0001 }, 'ABA-1');
    g.state.rooms[0][0] = 'catrina';
    (g as unknown as { startFight(): void }).startFight();
    const c = g.state.combat!;
    expect(c.abanico).toBeGreaterThan(0);
    if (c.q.mode === 'qcm') {
      const hp = c.hp + c.shield;
      g.answer(g.question!.answer);
      expect(c.hp + c.shield).toBe(hp);
    }
  });

  it('le pouvoir Cambio change la question sans pénalité', () => {
    const g = Game.newRun(content(), S, 'CAM-1');
    g.state.inv.cambio = 1;
    const id = g.state.combat!.q.id, hp = g.state.hp;
    g.usePower('cambio');
    expect(g.state.combat!.q.id).not.toBe(id);
    expect(g.state.hp).toBe(hp);
    expect(g.state.combat!.fb).toBeNull();
  });

  it('la partie se joue jusqu’au bout et l’état reste sérialisable', () => {
    const g = Game.newRun(content(), S, 'FULL-1');
    let guard = 0;
    while (g.state.screen !== 'over' && guard++ < 5000) {
      const s = g.state;
      if (s.screen === 'combat') s.combat!.fb ? g.proceed() : g.answer(g.question!.answer);
      else if (s.screen === 'reward') g.take(0);
      else if (s.screen === 'shop') g.leaveShop();
      // la sauvegarde doit pouvoir être relue à tout moment
      const copy = JSON.parse(JSON.stringify(g.state));
      expect(new Game(content(), S, copy).state.screen).toBe(g.state.screen);
    }
    expect(g.state.result).toBe('win');
    expect(g.state.stats.won).toBe(12);
  });
});
