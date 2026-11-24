/**
 * Synthèse vocale du navigateur (speechSynthesis). Les voix installées sur l'appareil passent en premier ;
 * à défaut (cas fréquent sur les PC de collège), une voix « en ligne » de Chrome ou Edge, choix validé par le professeur :
 * seule la phrase de la banque part chez Google ou Microsoft, jamais rien sur l'élève.
 * Ordre de préférence des voix : celui de sequence.json (es-MX, es-US, es-ES, es…).
 * Si aucune voix espagnole n'existe, l'interface passe en « lecture flash ».
 */

let cachedVoices: SpeechSynthesisVoice[] = [];
let loaded = false;
const waiters: (() => void)[] = [];

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function refresh() {
  const s = synth();
  if (!s) return;
  cachedVoices = s.getVoices();
  if (cachedVoices.length) {
    loaded = true;
    waiters.splice(0).forEach(f => f());
  }
}

if (synth()) {
  refresh();
  synth()!.addEventListener?.('voiceschanged', refresh);
}

/** Attend la liste des voix (au plus 1,5 s : certains navigateurs ne la donnent jamais). */
export function voicesReady(): Promise<void> {
  if (loaded || !synth()) return Promise.resolve();
  return new Promise(res => {
    waiters.push(res);
    setTimeout(() => {
      refresh();
      res();
    }, 1500);
  });
}

export function pickVoice(prefs: string[]): SpeechSynthesisVoice | null {
  const es = cachedVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
  // voix installées d'abord ; une voix en ligne muette (pas de réseau) déclenche la lecture éclair via onFail
  for (const vs of [es.filter(v => v.localService !== false), es]) {
    for (const p of prefs) {
      const exact = vs.find(v => v.lang.toLowerCase().replace('_', '-') === p.toLowerCase());
      if (exact) return exact;
    }
    if (vs.length) return vs[0];
  }
  return null;
}

export function canSpeak(prefs: string[]): boolean {
  return !!synth() && !!pickVoice(prefs);
}

/** Lit un texte. Renvoie false si c'est impossible (pas de voix espagnole) ; onFail si la voix échoue en cours de route. */
export function speak(text: string, prefs: string[], rate = 0.9, onFail?: () => void): boolean {
  const s = synth();
  const v = pickVoice(prefs);
  if (!s || !v) return false;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = rate;
    u.onerror = e => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') onFail?.();
    };
    // Chrome perd parfois une phrase lancée juste après cancel()
    setTimeout(() => s.speak(u), 50);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try {
    synth()?.cancel();
  } catch {
    /* rien */
  }
}
