/** Affichage d'une question et saisie de la réponse (partagés par le combat, les événements et les coffres). */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Asked } from '../engine/game';
import type { Question } from '../engine/schema';

const ACCENTS = [...'áéíóúñü¿¡'];

/** Énoncé avec les trous ___ (remplis après la réponse). */
export function Prompt({ q, revealed }: { q: Question; revealed: boolean }) {
  const parts = q.answer.split(' / ');
  let k = 0;
  const body = q.prompt.includes('___')
    ? q.prompt.split('___').flatMap((seg, i, arr) =>
        i < arr.length - 1 ? [seg, <span class="hueco" key={i}>{revealed ? parts[k++] ?? q.answer : ' '}</span>] : [seg],
      )
    : q.prompt;
  return (
    <div class="enun" lang={q.promptLang}>
      {q.emoji && (
        <span class="emo" aria-hidden="true">
          {q.emoji}
        </span>
      )}
      {body}
    </div>
  );
}

/** Champ de réponse écrite avec clavier d'accents. */
export function WriteInput({ onSubmit, resetKey }: { onSubmit: (v: string) => void; resetKey: string }) {
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTyped('');
    ref.current?.focus({ preventScroll: true });
  }, [resetKey]);
  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart ?? typed.length, b = el.selectionEnd ?? a;
    setTyped(typed.slice(0, a) + ch + typed.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + 1, a + 1);
    });
  };
  return (
    <>
      <form
        class="escr"
        onSubmit={ev => {
          ev.preventDefault();
          onSubmit(typed);
        }}
      >
        <input
          ref={ref}
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
  );
}

/** Boutons de QCM (touches 1 à 4 au clavier). */
export function Options({ asked, q, given, done, hidden = [], onPick }: {
  asked: Asked; q: Question; given: string | null; done: boolean; hidden?: string[]; onPick: (o: string) => void;
}) {
  useEffect(() => {
    if (done || asked.mode !== 'qcm') return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || (ev.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = Number(ev.key);
      if (n >= 1 && n <= asked.options.length) {
        const o = asked.options[n - 1];
        if (!hidden.includes(o)) onPick(o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [asked, done, hidden.join('|')]);
  return (
    <div class="ops" role="group" aria-label="Réponses possibles">
      {asked.options.map((o, i) => {
        let cls = '';
        let dis = done;
        if (hidden.includes(o)) {
          cls = 'out';
          dis = true;
        }
        if (done) {
          if (o === q.answer) cls = 'good';
          else if (o === given) cls = 'bad';
        }
        return (
          <button class={`op ${cls}`} key={asked.id + i} disabled={dis} onClick={() => onPick(o)}>
            <kbd aria-hidden="true">{i + 1}</kbd>
            <span lang={q.answerLang}>{o}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Question complète hors combat : énoncé, réponse, correction. */
export function QuizView({ q, asked, fb, onAnswer, children }: {
  q: Question; asked: Asked; fb: { verdict: string; given: string } | null; onAnswer: (v: string) => void; children?: ComponentChildren;
}) {
  return (
    <div class="qa quiz" data-qid={q.id} data-mode={asked.mode}>
      <div class="tipo">
        <span class="lbl">
          {q.label ?? ''}
          {asked.mode === 'write' ? " · à l'écrit" : ''}
        </span>
      </div>
      <Prompt q={q} revealed={!!fb} />
      {asked.mode === 'qcm' ? (
        <Options asked={asked} q={q} given={fb?.given ?? null} done={!!fb} onPick={onAnswer} />
      ) : (
        !fb && <WriteInput onSubmit={onAnswer} resetKey={asked.id} />
      )}
      {fb && (
        <div class={`fb ${fb.verdict}`} role="status">
          <h3>{fb.verdict === 'ok' ? '¡Muy bien!' : fb.verdict === 'casi' ? '¡Casi! Ça passe.' : '¡Uy!'}</h3>
          {(fb.verdict !== 'ok' || asked.mode === 'write') && (
            <p class="sol">
              {asked.mode === 'write' && fb.verdict !== 'ok' ? `Tu as écrit « ${fb.given} ». ` : ''}
              Bonne réponse : <b lang={q.answerLang}>{q.answer}</b>
            </p>
          )}
          {fb.verdict !== 'ok' && <p>{q.explanation}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
