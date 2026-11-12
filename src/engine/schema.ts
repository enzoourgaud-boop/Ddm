/**
 * Schémas du contenu (zod). Le moteur ne suppose rien du thème de la séquence :
 * tout ce qui est propre au Día de Muertos vit dans content/sequences/<id>/.
 */
import { z } from 'zod';

/* ---------- Questions ---------- */

/** Niveau : 1, 2, 3 ou "jefe" (niveau spécial des jefes finaux). En interne, "jefe" = 4. */
export const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('jefe')]);

export const CheckSchema = z
  .object({
    /** Les articles (el, la, los, las, un, una…) sont facultatifs. */
    ignoreArticles: z.boolean().optional(),
    /** Le pronom sujet (yo, tú, nosotros…) est facultatif. */
    optionalSubject: z.boolean().optional(),
  })
  .strict();

const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "l'identifiant ne doit contenir que des minuscules, chiffres et tirets");

const baseFields = {
  id: idSchema,
  theme: z.string().min(1),
  notions: z.array(z.string().min(1)).min(1, 'au moins une notion'),
  level: LevelSchema,
  /** Consigne courte affichée au-dessus de l'énoncé (en français). */
  label: z.string().optional(),
  prompt: z.string().min(1, "l'énoncé est vide"),
  promptLang: z.enum(['es', 'fr']).default('es'),
  emoji: z.string().optional(),
  answer: z.string().min(1, 'la réponse est vide'),
  /** Langue des réponses (es par défaut). */
  answerLang: z.enum(['es', 'fr']).default('es'),
  accept: z.array(z.string().min(1)).default([]),
  distractors: z.array(z.string().min(1)).min(3, 'il faut au moins 3 distracteurs'),
  translation: z.string().default(''),
  explanation: z.string().min(1, "l'explication est vide"),
  source: z.string().min(1),
  check: CheckSchema.optional(),
  /** Le professeur peut désactiver une question sans la supprimer. */
  disabled: z.boolean().optional(),
};

export const QcmQuestionSchema = z
  .object({
    ...baseFields,
    type: z.literal('qcm'),
    /** La question peut aussi être posée à l'écrit (champ de saisie). */
    writable: z.boolean().default(false),
  })
  .strict();

export const EcritQuestionSchema = z.object({ ...baseFields, type: z.literal('ecrit') }).strict();

export const QuestionSchema = z.discriminatedUnion('type', [QcmQuestionSchema, EcritQuestionSchema]);
export const QuestionListSchema = z.array(QuestionSchema);

export type QuestionInput = z.input<typeof QuestionSchema>;
export type Question = z.output<typeof QuestionSchema>;
export type QuestionType = Question['type'];

/* ---------- Ennemis ---------- */

export const IntentSchema = z
  .object({
    kind: z.enum(['attack', 'shield', 'heal', 'steal', 'rush', 'poison', 'fog', 'stealItem']),
    value: z.number().int().positive().optional(),
  })
  .strict();
export type Intent = z.infer<typeof IntentSchema>;

export const TraitSchema = z.enum(['vanish', 'colorShift', 'juicio', 'crescendo', 'abanico', 'vanidad', 'ultimoBaile']);
export type Trait = z.infer<typeof TraitSchema>;

export const ModifierSchema = z.enum(['soloEscrito', 'prisa', 'niebla']);
export type Modifier = z.infer<typeof ModifierSchema>;

export const PhaseSchema = z
  .object({
    name: z.string(),
    /** La phase commence quand les PV de l'ennemi passent sous cette fraction (1 = dès le début). */
    from: z.number().min(0).max(1),
    traits: z.array(TraitSchema).default([]),
    intents: z.array(IntentSchema).min(1),
    themes: z.array(z.string()).optional(),
    levels: z.array(LevelSchema).optional(),
    attackBonus: z.number().int().default(0),
    abanico: z.number().int().optional(),
    message: z.string(),
  })
  .strict();
export type Phase = z.infer<typeof PhaseSchema>;

export const EnemySchema = z
  .object({
    id: idSchema,
    name: z.string(),
    emoji: z.string(),
    top: z.string().optional(),
    card: z.number().int().min(1).max(99),
    kind: z.enum(['normal', 'elite', 'jefe', 'final']),
    hp: z.number().int().positive(),
    attack: z.number().int().positive(),
    pattern: z.enum(['cycle', 'random']),
    intents: z.array(IntentSchema).min(1),
    traits: z.array(TraitSchema).default([]),
    modifier: ModifierSchema.optional(),
    phases: z.array(PhaseSchema).optional(),
    /** Thème imposé par le trait « juicio » (une question sur trois). */
    focusTheme: z.string().optional(),
    taunt: z.string().optional(),
  })
  .strict();
export type Enemy = z.infer<typeof EnemySchema>;

/* ---------- Objets ---------- */

export const EffectSchema = z.enum([
  // aides
  'translate', 'hint', 'scissors', 'oracle', 'swap', 'time', 'heal', 'autoShield',
  // reliques
  'damageBonus', 'writeBonus', 'streakMaster', 'maxHp', 'goldPerCorrect', 'healAfterFight', 'accentForgive',
]);
export type Effect = z.infer<typeof EffectSchema>;

export const ItemSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['aide', 'reliquia']),
    rarity: z.enum(['comun', 'rara', 'legendaria']),
    name: z.string(),
    emoji: z.string(),
    price: z.number().int().nonnegative(),
    max: z.number().int().positive().optional(),
    auto: z.boolean().optional(),
    effect: EffectSchema,
    value: z.number().optional(),
    description: z.string(),
  })
  .strict();
export type Item = z.infer<typeof ItemSchema>;
export type Rarity = Item['rarity'];

/* ---------- Séquence ---------- */

export const SequenceSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    tagline: z.string(),
    intro: z.string(),
    victory: z.string(),
    victoryTitle: z.string(),
    defeatTitle: z.string(),
    voices: z.array(z.string()).default(['es-ES', 'es']),
    themes: z
      .array(
        z
          .object({
            id: idSchema,
            label: z.string(),
            color: z.string(),
            translationOptional: z.boolean().default(false),
            check: CheckSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    notions: z.array(z.object({ id: idSchema, label: z.string() }).strict()),
    sources: z.array(z.object({ id: idSchema, title: z.string(), file: z.string() }).strict()),
    player: z
      .object({ hp: z.number().int().positive(), startItems: z.record(z.string(), z.number().int().nonnegative()) })
      .strict(),
    acts: z
      .array(
        z
          .object({
            id: idSchema,
            name: z.string(),
            color: z.string(),
            level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            chrono: z.number().positive(),
            writeShare: z.number().min(0).max(1),
            enemies: z.array(z.string()).min(1),
            elites: z.array(z.string()).min(1),
            boss: z.string(),
          })
          .strict(),
      )
      .min(1),
    feedback: z
      .object({
        ok: z.array(z.string()).min(1),
        ko: z.array(z.string()).min(1),
        casi: z.string(),
        timeout: z.string(),
        oracle: z.string(),
      })
      .strict(),
  })
  .strict();
export type Sequence = z.infer<typeof SequenceSchema>;
export type Act = Sequence['acts'][number];
export type Theme = Sequence['themes'][number];

/** Contenu complet, validé, prêt pour le moteur. */
export interface Content {
  sequence: Sequence;
  questions: Question[];
  enemies: Enemy[];
  items: Item[];
}

export const levelNum = (l: Question['level']): 1 | 2 | 3 | 4 => (l === 'jefe' ? 4 : l);
