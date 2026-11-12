/** Racine de l'application : chargement du contenu, sauvegarde, aiguillage des écrans. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadContent } from '../content/load';
import { DEFAULT_SETTINGS, Game, type RunState, type Settings } from '../engine/game';
import { randomSeed } from '../engine/rng';
import { storage } from '../storage';
import { Combat } from './Combat';
import { PapelPicado, useGame } from './components';
import { type Meta, Over, Reward, Shop, Title } from './screens';

const loaded = loadContent();

function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...storage.get<Partial<Settings>>('settings', {}) };
}

function loadSaved(): RunState | null {
  const r = storage.get<RunState | null>('run', null);
  if (!r || r.v !== 1 || r.screen === 'over') return null;
  return r;
}

function urlSeed(): string {
  try {
    return new URLSearchParams(location.search).get('graine') ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const { content, issues } = loaded;
  if (!content) {
    return (
      <section class="screen">
        <h1>Contenu invalide</h1>
        <p>Le jeu ne peut pas démarrer : les fichiers de contenu contiennent des erreurs.</p>
        <ul>
          {issues.filter(i => i.level === 'erreur').slice(0, 30).map((i, k) => (
            <li key={k}>
              <b>{i.where}</b> : {i.message}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return <Main content={content} />;
}

function Main({ content }: { content: NonNullable<typeof loaded.content> }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [game, setGame] = useState<Game | null>(null);
  const [saved, setSaved] = useState(loadSaved);
  const [meta, setMeta] = useState<Meta>(() => storage.get<Meta>('meta', { bestWon: 0, wins: 0, runs: 0 }));
  const [persistent, setPersistent] = useState(storage.persistent);
  const initialSeed = useMemo(urlSeed, []);
  useGame(game);

  useEffect(() => storage.onFailure(() => setPersistent(false)) as () => void, []);

  // sauvegarde continue de la partie et bilan à la fin
  useEffect(() => {
    if (!game) return;
    let recorded = false;
    return game.subscribe(() => {
      const s = game.state;
      if (s.screen === 'over') {
        storage.remove('run');
        if (!recorded) {
          recorded = true;
          setMeta(m => {
            const next = { bestWon: Math.max(m.bestWon, s.stats.won), wins: m.wins + (s.result === 'win' ? 1 : 0), runs: m.runs + 1 };
            storage.set('meta', next);
            return next;
          });
        }
      } else storage.set('run', s);
    });
  }, [game]);

  // remonte en haut de page à chaque changement d'écran
  const screen = game?.state.screen ?? 'title';
  const room = game ? `${game.state.act}-${game.state.room}` : '';
  useEffect(() => window.scrollTo({ top: 0 }), [screen, room]);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    storage.set('settings', s);
  };
  const start = (seed: string) => {
    const g = Game.newRun(content, settings, seed || randomSeed());
    storage.set('run', g.state);
    setSaved(null);
    setGame(g);
  };
  const resume = () => {
    if (!saved) return;
    try {
      const g = new Game(content, settings, saved);
      if (!g.enemy && saved.screen === 'combat') throw new Error('partie illisible');
      setGame(g);
    } catch {
      storage.remove('run');
      setSaved(null);
    }
  };
  const toMenu = () => {
    setSaved(loadSaved());
    setGame(null);
  };

  return (
    <>
      <PapelPicado />
      <main id="app">
        {!persistent && (
          <p class="banner" role="status">
            Ce navigateur bloque la sauvegarde : tu peux jouer, mais ta progression ne sera pas gardée sur cet appareil.
          </p>
        )}
        {!game && (
          <Title content={content} meta={meta} saved={saved} settings={settings} onSettings={setSettings} onStart={start} onResume={resume} initialSeed={initialSeed} />
        )}
        {game && game.state.screen === 'combat' && <Combat game={game} />}
        {game && game.state.screen === 'reward' && <Reward game={game} />}
        {game && game.state.screen === 'shop' && <Shop game={game} />}
        {game && game.state.screen === 'over' && <Over game={game} onMenu={toMenu} onReplay={() => start('')} />}
        {game && game.state.screen !== 'over' && (
          <p>
            <button class="link" onClick={toMenu}>
              Revenir au menu (la partie est sauvegardée)
            </button>
          </p>
        )}
      </main>
    </>
  );
}
