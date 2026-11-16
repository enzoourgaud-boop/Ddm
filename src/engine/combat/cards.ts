/**
 * Les cartes de lotería : ce qu'elles font, comment on les décrit, comment on pioche.
 * Fonctions pures : rien ici ne touche à l'état de la partie.
 */
import type { Rng } from '../rng';
import type { Card, CardEffect, CardInst, Family } from '../schema';

export const FAMILIES: Record<Family, { label: string; ico: string; color: string; theme: string }> = {
  golpe: { label: 'Golpe', ico: '🗡️', color: '#22d1c6', theme: 'vocabulario' },
  hechizo: { label: 'Hechizo', ico: '✨', color: '#ff9f1c', theme: 'conjugacion' },
  mirada: { label: 'Mirada', ico: '👁️', color: '#9b6cff', theme: 'gramatica' },
  saber: { label: 'Saber', ico: '📜', color: '#ff3d8b', theme: 'cultura' },
};

/** Effets d'une carte possédée : la version « fuerte » si elle a été améliorée. */
export function effectsOf(card: Card, inst?: Pick<CardInst, 'up'> | null): CardEffect[] {
  return inst?.up === 'fuerte' && card.upgrade ? card.upgrade : card.effects;
}

/** Multiplie les valeurs chiffrées (a la pluma, Mayas y aztecas, ¡Casi!). */
export function scaleEffects(effects: CardEffect[], k: number): CardEffect[] {
  if (k === 1) return effects;
  return effects.map(e => (e.value === undefined ? e : { ...e, value: Math.max(e.do === 'damage' || e.do === 'strike' ? 1 : 0, Math.round(e.value * k)) }));
}

/** Dégâts potentiels d'une liste d'effets (pour le robot de simulation et les infobulles). */
export function damageOf(effects: CardEffect[], streak = 0): number {
  let d = 0;
  for (const e of effects) {
    if (e.do === 'damage' || e.do === 'strike') d += (e.value ?? 0) * (e.times ?? 1);
    if (e.do === 'streakBonus' && streak >= (e.streak ?? 3)) d += e.value ?? 0;
  }
  return d;
}
export const shieldOf = (effects: CardEffect[]) => effects.filter(e => e.do === 'shield').reduce((a, e) => a + (e.value ?? 0), 0);
export const healOf = (effects: CardEffect[]) => effects.filter(e => e.do === 'heal').reduce((a, e) => a + (e.value ?? 0), 0);

/** Texte court d'une liste d'effets, en français. */
export function describeEffects(effects: CardEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    switch (e.do) {
      case 'damage': parts.push(e.times && e.times > 1 ? `${e.value} dégâts × ${e.times}` : `${e.value} dégâts`); break;
      case 'strike': parts.push(`${e.value} dégâts qui traversent le bouclier`); break;
      case 'shield': parts.push(`bouclier ${e.value}`); break;
      case 'heal': parts.push(`+${e.value} PV`); break;
      case 'streakBonus': parts.push(`+${e.value} dégâts si série ≥ ${e.streak ?? 3}`); break;
      case 'repeatLast': parts.push('rejoue la dernière carte'); break;
      case 'double': parts.push('prochaine carte doublée'); break;
      case 'cleanse': parts.push('dissipe bouclier et abanico'); break;
      case 'gold': parts.push(`+${e.value} monedas`); break;
    }
  }
  return parts.join(' · ');
}

/** Nom affiché d'une carte possédée : « La Calavera+ » ou « La Calavera ✒ ». */
export function instName(card: Card, inst?: Pick<CardInst, 'up'> | null): string {
  return card.name + (inst?.up === 'fuerte' ? '+' : inst?.up === 'pluma' ? ' ✒' : '');
}

/** Pioche n cartes ; quand la pioche est vide, la défausse est mélangée et redevient la pioche. */
export function drawCards(rng: Rng, draw: number[], discard: number[], n: number): { hand: number[]; draw: number[]; discard: number[] } {
  let d = [...draw], disc = [...discard];
  const hand: number[] = [];
  while (hand.length < n) {
    if (!d.length) {
      if (!disc.length) break;
      d = rng.shuffle(disc);
      disc = [];
    }
    hand.push(d.shift()!);
  }
  return { hand, draw: d, discard: disc };
}
