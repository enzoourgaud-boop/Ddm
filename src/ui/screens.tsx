/** Écrans hors combat : accueil, récompense, Tianguis, bilan. */
import { useState } from 'preact/hooks';
import { Game, type RunState, type Settings } from '../engine/game';
import type { Content } from '../engine/schema';
import { cleanSeed } from '../engine/rng';
import { Carta, Hud, ItemCard, Powers } from './components';

export interface Meta {
  bestWon: number;
  wins: number;
  runs: number;
}

export function Title({ content, meta, saved, settings, onSettings, onStart, onResume, initialSeed }: {
  content: Content; meta: Meta; saved: RunState | null; settings: Settings;
  onSettings: (s: Settings) => void; onStart: (seed: string) => void; onResume: () => void; initialSeed: string;
}) {
  const seq = content.sequence;
  const [seed, setSeed] = useState(initialSeed);
  const bosses = seq.acts.map(a => ({ e: content.enemies.find(e => e.id === a.boss)!, c: a.color })).filter(x => x.e);
  const total = seq.acts.length * 4;
  return (
    <section class="screen portada">
      <span class="lbl">{seq.tagline}</span>
      <h1>{seq.title}</h1>
      <p class="lead">{seq.intro}</p>
      <div class="cartas">
        {bosses.map(b => (
          <Carta key={b.e.id} enemy={b.e} color={b.c} />
        ))}
      </div>
      <div class="fila">
        {saved && (
          <button class="btn" onClick={onResume}>
            Reprendre la partie (acte {saved.act + 1})
          </button>
        )}
        <button class={`btn ${saved ? 'sec' : ''}`} onClick={() => onStart(cleanSeed(seed))}>
          {saved ? 'Nouvelle partie' : 'Commencer le chemin'}
        </button>
        {meta.runs > 0 && (
          <span class="muted">
            Ton record : {meta.bestWon}/{total} combats{meta.wins ? ` · ${meta.wins} victoire${meta.wins > 1 ? 's' : ''}` : ''}
          </span>
        )}
      </div>
      <div class="opciones">
        <label>
          <span>Graine (défi de classe)</span>
          <input type="text" value={seed} placeholder="au hasard" maxLength={24} onInput={e => setSeed((e.target as HTMLInputElement).value)} aria-describedby="seed-help" />
        </label>
        <label>
          <input type="checkbox" checked={settings.chrono} onChange={e => onSettings({ ...settings, chrono: (e.target as HTMLInputElement).checked })} />
          Chrono
        </label>
        <span id="seed-help" class="muted" style={{ fontSize: '.85rem', flexBasis: '100%' }}>
          Même graine = même chemin et mêmes ennemis pour toute la classe. Laisse vide pour un chemin au hasard.
        </span>
      </div>
      <div class="reglas">
        <div>
          <b>Réponds pour attaquer</b>Vocabulaire, conjugaison (estar + gérondif), grammaire (ser, estar, hay, décrire une image) et culture.
        </div>
        <div>
          <b>Lis l'intention</b>La bulle au-dessus de l'ennemi annonce ce qu'il fera si tu te trompes : attaque, bouclier, vol de monedas, chrono raccourci…
        </div>
        <div>
          <b>Ramasse des pouvoirs</b>Traductor, Chuleta, Oráculo… Après chaque combat, choisis une aide ou une relique.
        </div>
        <div>
          <b>Écris pour frapper fort</b>Une réponse écrite fait plus de dégâts qu'un QCM, et 3 bonnes réponses d'affilée renforcent tes coups.
        </div>
      </div>
    </section>
  );
}

export function Reward({ game }: { game: Game }) {
  const s = game.state;
  const nextId = s.rooms[s.act]?.[s.room + 1];
  const next = nextId ? game.enemyDef(nextId) : null;
  return (
    <section class="screen">
      <Hud game={game} />
      <h2>¡Victoria! Choisis un pouvoir</h2>
      <p class="muted">
        {s.offerKind === 'elite' ? "Récompense d'élite : une relique au choix. " : ''}
        Tu n'en gardes qu'un. Les aides se dépensent, les reliques durent toute la partie.
      </p>
      {next?.kind === 'final' && (
        <div class="aviso">
          <b>Attention, la {next.name.replace(/^La /, '')} t'attend.</b> Elle a plusieurs phases : lis bien les messages quand elle change de style.
        </div>
      )}
      {next?.kind === 'jefe' && (
        <div class="aviso">
          <b>Prochain combat : {next.name}, le jefe de l'acte.</b> {next.taunt}
        </div>
      )}
      <div class="elige">
        {s.offer!.map((o, i) => (
          <ItemCard key={o.id + i} item={game.item(o.id)!} onClick={() => game.take(i)} />
        ))}
      </div>
      <div>
        <button class="link" onClick={() => game.take(-1)}>
          Ne rien prendre
        </button>
      </div>
      <Powers game={game} inCombat={false} />
    </section>
  );
}

export function Shop({ game }: { game: Game }) {
  const s = game.state;
  const next = game.content.sequence.acts[s.act + 1];
  const G = Game;
  const meal = s.hp < s.maxHp && s.gold >= G.MEAL_PRICE;
  return (
    <section class="screen">
      <Hud game={game} />
      <h2>El Tianguis</h2>
      <p class="muted">
        Le jefe est vaincu et tu récupères 3 PV. Ce petit marché vend des aides et des reliques : dépense tes monedas avant de partir vers {next?.name}.
      </p>
      <div class="elige">
        {s.offer!.map((o, i) => {
          const it = game.item(o.id)!;
          return <ItemCard key={o.id + i} item={it} price={it.price} sold={o.sold} disabled={o.sold || s.gold < it.price} onClick={() => game.buy(i)} />;
        })}
        <button class="item" onClick={() => game.buyMeal()} disabled={!meal}>
          <span class="ico" aria-hidden="true">🫔</span>
          <span class="tp">Repas</span>
          <span class="nm">Tamales</span>
          <span class="ds">Rend {G.MEAL_HEAL} points de vie.</span>
          <span class="px">🪙 {G.MEAL_PRICE}</span>
        </button>
      </div>
      <div>
        <button class="btn" onClick={() => game.leaveShop()}>
          Partir vers {next?.name}
        </button>
      </div>
      <Powers game={game} inCombat={false} />
    </section>
  );
}

export function Over({ game, onMenu, onReplay }: { game: Game; onMenu: () => void; onReplay: () => void }) {
  const s = game.state, seq = game.content.sequence;
  const win = s.result === 'win';
  const tot = s.stats.ok + s.stats.ko + s.stats.casi;
  const pct = tot ? Math.round((100 * s.stats.ok) / tot) : 0;
  const total = s.rooms.reduce((n, r) => n + r.length, 0);
  const minutes = Math.max(1, Math.round((s.stats.endedAt - s.stats.startedAt) / 60000));
  const enemy = game.enemy;
  return (
    <section class="screen">
      <h1>{win ? seq.victoryTitle : seq.defeatTitle}</h1>
      <p class="lead">
        {win
          ? seq.victory
          : `${enemy?.name ?? 'Le chemin'} t'a arrêté à l'acte ${s.act + 1}. Relis ton carnet d'erreurs, puis reprends le chemin.`}
      </p>
      <div class="stats">
        <div>
          <b>
            {s.stats.won}/{total}
          </b>
          combats gagnés
        </div>
        <div>
          <b>{s.stats.ok}</b>bonnes réponses
        </div>
        <div>
          <b>{pct} %</b>de réussite
        </div>
        <div>
          <b>{s.stats.written}</b>réponses écrites
        </div>
        <div>
          <b>{minutes} min</b>de partie
        </div>
      </div>
      <p class="muted">
        Graine de la partie : <b>{s.seed}</b>
      </p>
      <div class="fila">
        <button class="btn" onClick={onReplay}>
          Rejouer
        </button>
        <button class="btn sec" onClick={onMenu}>
          Menu
        </button>
      </div>
      {s.errors.length ? (
        <>
          <h2>Carnet d'erreurs</h2>
          <ul class="carnet">
            {s.errors.map(e => (
              <li key={e.id}>
                <div class="q">{e.prompt}</div>
                {e.given && <div class="g">Ta réponse : {e.given}</div>}
                <div class="a" lang="es">
                  {e.answer}
                </div>
                <div class="r">{e.explanation}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="muted">Aucune erreur dans cette partie. ¡Increíble!</p>
      )}
    </section>
  );
}
