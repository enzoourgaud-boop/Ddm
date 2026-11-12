/** Écran de combat : ennemi + intention, question, réponse, retour, pouvoirs. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../engine/game';
import { Carta, Hud, intentInfo, MODIFIERS, Powers } from './components';

function Crono({ game }: { game: Game }) {
  const [, setTick] = useState(0);
  const force = () => setTick(x => x + 1);
  useEffect(() => {
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 1000);
      last = now;
      if (document.hidden) return;
      if (!game.tick(dt)) force();
    }, 200);
    return () => clearInterval(t);
  }, [game]);
  const c = game.state.combat;
  if (!c || !c.timeMax) return null;
  const s = Math.ceil(c.timeLeft / 1000);
  return (
    <div class={`crono ${c.timeLeft <= 5000 ? 'urge' : ''}`} role="timer" aria-label={`Temps restant : ${s} secondes`}>
      <span aria-hidden="true">⏱️</span>
      <div class="bar" aria-hidden="true">
        <i style={{ width: `${(100 * c.timeLeft) / c.timeMax}%` }} />
      </div>
      <b aria-hidden="true">{s} s</b>
    </div>
  );
}

const ACCENTS = [...'áéíóúñü¿¡'];

export function Combat({ game }: { game: Game }) {
  const s = game.state, c = s.combat!, q = game.question!, e = game.enemy!, act = game.act;
  const fb = c.fb;
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const contRef = useRef<HTMLButtonElement>(null);
  const qKey = `${c.turn}:${c.q.id}`;

  useEffect(() => setTyped(''), [qKey]);
  useEffect(() => {
    if (fb) contRef.current?.focus({ preventScroll: true });
    else inputRef.current?.focus({ preventScroll: true });
  }, [qKey, !!fb]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (fb || c.q.mode !== 'qcm' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = Number(ev.key);
      if (n >= 1 && n <= c.q.options.length) {
        const o = c.q.options[n - 1];
        if (!c.hidden.includes(o)) game.answer(o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [game, qKey, !!fb]);

  const theme = game.content.sequence.themes.find(t => t.id === q.theme);
  const phase = game.phase;
  const info = intentInfo(game, c.intent);
  const mod = e.modifier ? MODIFIERS[e.modifier] : null;
  const dead = c.hp <= 0;

  // énoncé avec trous
  const parts = q.answer.split(' / ');
  let k = 0;
  const prompt = q.prompt.includes('___')
    ? q.prompt.split('___').flatMap((seg, i, arr) =>
        i < arr.length - 1 ? [seg, <span class="hueco" key={i}>{fb ? parts[k++] ?? q.answer : ' '}</span>] : [seg],
      )
    : q.prompt;

  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) return;
    const a = el.selectionStart ?? typed.length, b = el.selectionEnd ?? a;
    const v = typed.slice(0, a) + ch + typed.slice(b);
    setTyped(v);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + 1, a + 1);
    });
  };

  const tag = e.kind === 'final' ? 'Jefa final' : e.kind === 'jefe' ? 'Jefe' : e.kind === 'elite' ? 'Élite' : 'Enemigo';
  const contLabel = s.hp <= 0 ? 'Voir le bilan' : dead ? `¡Victoria! ${e.name} est vaincu${e.name.startsWith('La ') ? 'e' : ''}` : 'Continuer';

  return (
    <section class="screen" aria-label="Combat">
      <Hud game={game} hit={!!fb && fb.dmgToPlayer > 0} />
      <div class="arena">
        <div class="foe">
          <div class="intencion" key={`i${c.turn}`} aria-label={`Intention de l'ennemi : ${info.text}, ${info.sub}`}>
            <span class="ico" aria-hidden="true">{c.juicio ? '⚖️' : info.ico}</span>
            <span>
              {c.juicio ? 'Juicio · ' : ''}
              {info.text}
              <small>{info.sub}</small>
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <Carta key={e.id} enemy={e} color={act.color} cls={`voltea ${fb && fb.dmgToEnemy > 0 && !dead ? 'hit' : ''} ${dead ? 'muere' : ''}`} />
            {fb && fb.outcome !== 'casi' && fb.outcome !== 'ko' && fb.outcome !== 'timeout' && (
              <span class={`flotante ${fb.dmgToEnemy ? '' : 'cero'}`} key={`f${c.turn}`} aria-hidden="true">
                −{fb.dmgToEnemy}
              </span>
            )}
          </div>
          <div class="vida">
            <span class="lbl">{tag}</span>
            <div class="bar foe" role="meter" aria-label={`Vie de ${e.name}`} aria-valuemin={0} aria-valuemax={c.maxHp} aria-valuenow={c.hp}>
              <i style={{ width: `${(100 * c.hp) / c.maxHp}%` }} />
              {c.shield > 0 && <span class="escudo" />}
            </div>
            <span class="atk">
              {c.hp}/{c.maxHp} PV{c.shield > 0 ? ` · 🛡️ ${c.shield}` : ''}
              {c.abanico > 0 ? ` · 🪭 ${c.abanico}` : ''}
            </span>
            {c.attackBonus > 0 && <span class="estado">🎺 Attaque +{c.attackBonus}</span>}
            {c.weakTheme && (
              <span class="estado">🎨 Vulnérable : {game.content.sequence.themes.find(t => t.id === c.weakTheme)?.label}</span>
            )}
            {phase && <span class="fase">Phase {c.phase + 1} : {phase.name}</span>}
            {mod && (
              <span class="modif" title={mod.desc}>
                {mod.ico} {mod.label}
              </span>
            )}
          </div>
        </div>

        <div class="qa" data-qid={q.id} data-mode={c.q.mode}>
          <div class="tipo">
            <span class="tag" style={{ '--k': theme?.color }}>
              {theme?.label ?? q.theme}
            </span>
            <span class="lbl">
              {q.label ?? ''}
              {c.q.mode === 'write' ? ' · à l\'écrit' : ''}
              {c.q.again ? ' · revanche' : ''}
            </span>
          </div>
          {!fb && <Crono game={game} />}
          <div class="enun" lang={q.promptLang}>
            {q.emoji && (
              <span class="emo" aria-hidden="true">
                {q.emoji}
              </span>
            )}
            {prompt}
          </div>
          {c.used.translate && (
            <div class="pista">
              <b>Traductor</b> {q.translation}
            </div>
          )}
          {c.used.hint && (
            <div class="pista">
              <b>Chuleta</b> {game.hintText()}
            </div>
          )}
          {c.mask && (
            <div class="pista">
              <b>Tijeras</b> <span class="mask">{c.mask}</span>
            </div>
          )}

          {c.q.mode === 'qcm' ? (
            <div class="ops" role="group" aria-label="Réponses possibles">
              {c.q.options.map((o, i) => {
                let cls = '';
                let dis = !!fb;
                if (c.hidden.includes(o)) {
                  cls = 'out';
                  dis = true;
                }
                if (fb) {
                  if (o === q.answer) cls = 'good';
                  else if (o === fb.given) cls = 'bad';
                }
                return (
                  <button class={`op ${cls}`} key={qKey + i} disabled={dis} onClick={() => game.answer(o)}>
                    <kbd aria-hidden="true">{i + 1}</kbd>
                    <span lang={q.answerLang}>{o}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            !fb && (
              <>
                <form
                  class="escr"
                  onSubmit={ev => {
                    ev.preventDefault();
                    game.answer(typed);
                  }}
                >
                  <input
                    ref={inputRef}
                    lang="es"
                    autocomplete="off"
                    autocapitalize="off"
                    autocorrect="off"
                    spellcheck={false}
                    placeholder="Ta réponse en espagnol…"
                    aria-label="Ta réponse en espagnol"
                    value={typed}
                    onInput={ev => setTyped((ev.target as HTMLInputElement).value)}
                  />
                  <button class="btn" type="submit">
                    Valider
                  </button>
                </form>
                <div class="tildes" role="group" aria-label="Lettres accentuées">
                  {ACCENTS.map(ch => (
                    <button type="button" key={ch} onClick={() => insert(ch)} aria-label={`Insérer ${ch}`}>
                      {ch}
                    </button>
                  ))}
                </div>
              </>
            )
          )}

          {fb && (
            <div class={`fb ${fb.outcome}`} role="status">
              <h3>{fb.title}</h3>
              {(fb.outcome !== 'ok' || c.q.mode === 'write') && (
                <p class="sol">
                  {c.q.mode === 'write' && fb.outcome !== 'ok' && fb.given ? `Tu as écrit « ${fb.given} ». ` : ''}
                  Bonne réponse : <b lang={q.answerLang}>{q.answer}</b>
                </p>
              )}
              {fb.outcome !== 'ok' && fb.outcome !== 'oracle' && <p>{q.explanation}</p>}
              {fb.lines.map((l, i) => (
                <p class="muted" key={i}>
                  {l}
                </p>
              ))}
              {fb.alert && <p class="alerta">{fb.alert}</p>}
              <div>
                <button class="btn" ref={contRef} onClick={() => game.proceed()}>
                  {contLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Powers game={game} inCombat={true} />
      {!fb && c.turn === 1 && e.taunt && (
        <p class="muted" lang="es">
          {e.name} : « {e.taunt} »
        </p>
      )}
    </section>
  );
}
