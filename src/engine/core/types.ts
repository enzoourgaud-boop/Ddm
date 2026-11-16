/**
 * Types de l'état d'une partie et constantes de réglage.
 * Tout ce qui est ici est sérialisable : c'est ce qui est sauvegardé dans le navigateur.
 */
import type { AccentPolicy, Verdict } from '../answer';
import type { ActMap } from '../map';
import type { Mode } from '../questions';
import type { CardInst, Intent, QuestionType, Rarity } from '../schema';

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

/** Réglages par défaut. Le chrono est coupé : c'est un choix pédagogique de la version 2 (il se rallume dans les Options). */
export const DEFAULT_SETTINGS: Settings = {
  themes: null, types: null, chrono: false, chronoFactor: 1, writeFactor: 1, accents: 'casi',
};

export interface Asked {
  id: string;
  mode: Mode;
  options: string[];
  again?: boolean;
}

export type Outcome = Verdict | 'timeout' | 'oracle';

/** Effets visuels à jouer après une réponse (l'interface décide comment les animer). */
export type Fx =
  | 'card' | 'enemyHit' | 'crit' | 'combo' | 'zero' | 'shieldHit' | 'vanish' | 'abanico' | 'heal' | 'enemyDown' | 'cleanse' | 'strike'
  | 'alma' | 'playerHit' | 'playerShield' | 'blocked' | 'reflect' | 'mask' | 'canceled' | 'steal' | 'stealItem' | 'poison' | 'playerDown'
  | 'casi' | 'phase' | 'revive' | 'playerHeal' | 'enemyShield' | 'juicio';

export interface Feedback {
  outcome: Outcome;
  /** Effets visuels, dans l'ordre. */
  fx: Fx[];
  title: string;
  given: string | null;
  /** Ce que la carte a fait (ou n'a pas fait). */
  lines: string[];
  /** Ce que l'ennemi a fait ensuite. */
  enemyLines: string[];
  alert?: string;
  /** Carte jouée (identifiant de carte). */
  card: string;
  dmgToEnemy: number;
  dmgToPlayer: number;
  shieldGained: number;
  healed: number;
  combo?: number;
}

/** Étape du tour : choisir une carte, relever le défi, voir le résultat. */
export type Stage = 'hand' | 'challenge' | 'resolve';

export interface CombatState {
  enemyId: string;
  hp: number;
  maxHp: number;
  shield: number;
  abanico: number;
  phase: number;
  turn: number;
  intent: Intent;
  /** L'intention de ce tour est annulée (Incienso). */
  canceled: boolean;
  attackBonus: number;
  weakTheme: string | null;
  juicio: boolean;
  vanishUsed: boolean;
  firstErrorUsed: boolean;
  freeTranslateUsed: boolean;
  rowCorrect: number;
  /** Erreurs pendant ce combat (combat parfait = 0). */
  errors: number;
  fog: boolean;
  /* --- cartes --- */
  stage: Stage;
  /** Pioche, main et défausse : identifiants uniques des cartes de la baraja. */
  draw: number[];
  hand: number[];
  discard: number[];
  /** Cartes « une fois par combat » déjà jouées. */
  spent: number[];
  /** Carte en cours de jeu (uid), et dernière carte jouée avec succès (identifiant de carte). */
  played: number | null;
  lastCard: string | null;
  /** Bouclier du joueur pour ce tour. */
  pshield: number;
  /** La prochaine carte a un effet doublé (Mayas y aztecas). */
  double: boolean;
  /* --- défi en cours --- */
  q: Asked;
  fb: Feedback | null;
  used: { translate?: boolean; hint?: boolean; scissors?: boolean };
  hidden: string[];
  mask: string;
  timeMax: number;
  timeLeft: number;
}

/** Petite question hors combat (événement, coffre). */
export interface QuizState {
  q: Asked;
  fb: { verdict: Verdict; given: string } | null;
}

export interface RoomResult {
  text: string;
  textFr?: string;
  lines: string[];
}

export interface EventState {
  id: string;
  choice: number | null;
  quiz: QuizState | null;
  result: RoomResult | null;
  pendingFight: 'normal' | 'elite' | null;
}

export interface ChestState {
  locked: boolean;
  quiz: QuizState | null;
  result: RoomResult | null;
}

export interface RestState {
  result: RoomResult | null;
}

/** Échauffement de début de partie : les questions ratées aux parties précédentes (« almas pendientes »). */
export interface WarmupState {
  ids: string[];
  i: number;
  quiz: QuizState;
  /** Âmes libérées pendant l'échauffement (chacune donne +1 PV). */
  freed: number;
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

export type Screen = 'warmup' | 'map' | 'combat' | 'reward' | 'shop' | 'rest' | 'event' | 'chest' | 'over';

export interface RunState {
  v: 4;
  /** Personnage choisi et niveau de difficulté (« Nivel de Calavera », 0 à 10). */
  character: string;
  ascension: number;
  /** Bonus du personnage. */
  bonus: { writeShare: number; restHeal: number };
  /** Ennemis vaincus et objets obtenus (collection de lotería). */
  defeated: string[];
  obtained: string[];
  seed: string;
  rng: number;
  screen: Screen;
  hp: number;
  maxHp: number;
  gold: number;
  act: number;
  map: ActMap;
  /** Salle actuelle (null = au départ de l'acte). */
  node: string | null;
  /** Salles traversées dans l'acte. */
  path: string[];
  inv: Record<string, number>;
  relics: Record<string, number>;
  upgrades: Record<string, boolean>;
  /** La baraja : toutes les cartes possédées. */
  deck: CardInst[];
  nextUid: number;
  streak: number;
  poison: number;
  reviveUsed: boolean;
  luckyCount: number;
  stats: {
    ok: number; ko: number; casi: number; won: number; written: number; turns: number; rooms: number; startedAt: number; endedAt: number;
    maxStreak: number; perfectFights: number; powersUsed: number;
    /** Questions ratées (dans cette partie ou une précédente) puis réussies : « almas liberadas ». */
    freed?: number;
    /** Cartes jouées, et cartes dont l'effet a réussi. */
    cards?: number;
    cardsOk?: number;
  };
  seen: Record<string, number>;
  /** Dernières questions posées (les plus récentes à la fin), pour éviter les enchaînements trop proches. */
  recent?: string[];
  /** Questions ratées à reposer (« almas pendientes ») : celles des parties précédentes, puis celles de cette partie. */
  retry: string[];
  warmup?: WarmupState | null;
  errors: ErrorEntry[];
  metEnemies: string[];
  seenEvents: string[];
  combat: CombatState | null;
  offer: Offer[] | null;
  offerKind: 'normal' | 'elite' | 'jefe' | null;
  /** Cartes proposées après un combat (ou au tianguis) : identifiants de cartes. */
  cardOffer: Offer[] | null;
  event: EventState | null;
  chest: ChestState | null;
  rest: RestState | null;
  result: 'win' | 'lose' | null;
}

/** Les types « manipulables », moins nombreux dans la banque, sortent un peu plus souvent pour varier. */
export const TYPE_WEIGHT: Partial<Record<QuestionType, number>> = { ordre: 2.2, association: 2, scene: 1.8, ecoute: 1.6, 'vrai-faux': 1.3 };

export const MAX_ASCENSION = 10;

/** Effets cumulatifs de chaque « Nivel de Calavera ». */
export const ASCENSION_RULES: string[] = [
  'Le chemin normal.',
  'Les ennemis ont 2 PV de plus.',
  'Le chrono est plus court de 3 secondes.',
  'Une aide de départ en moins.',
  'Les élites ont 4 PV et 1 attaque de plus.',
  'Les combats rapportent moins de monedas.',
  "La Ofrenda soigne moins (−10 points).",
  'Les jefes ont 6 PV de plus.',
  'Davantage de défis à écrire.',
  '5 PV de moins au départ.',
  'Le jefe final a 10 PV et 1 attaque de plus.',
];

/** Nombre de questions récentes comparées pour éviter les enchaînements proches. */
export const RECENT_WINDOW = 6;
/** Une question ratée ne revient pas avant ce nombre de questions. */
export const RETRY_GAP = 6;
/** Chance, à chaque défi de combat, de reposer une question ratée en attente. */
export const RETRY_CHANCE = 0.35;
/** Échauffement : nombre de questions au plus, et nombre de questions ratées reprises d'une partie à l'autre. */
export const WARMUP_MAX = 4;
export const CARRY_MAX = 12;
/** Bouclier maximal du joueur sur un tour. */
export const SHIELD_MAX = 12;
/** Prix du retrait d'une carte au tianguis. */
export const REMOVE_CARD_PRICE = 4;

export const RARITY_WEIGHT: Record<Rarity, number> = { comun: 60, rara: 30, legendaria: 10 };
export const BOSS_RARITY_WEIGHT: Record<Rarity, number> = { comun: 15, rara: 55, legendaria: 30 };
