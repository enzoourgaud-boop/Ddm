/**
 * Répond à la question affichée, quel que soit son type, en cliquant comme un élève.
 * Utilisé par les tests de bout en bout (Playwright). La bonne réponse est lue dans la banque JSON.
 */
const fs = require('fs');
const path = require('path');

function loadBank(seqDir) {
  const bank = {};
  const qdir = path.join(seqDir, 'questions');
  for (const f of fs.readdirSync(qdir)) for (const q of JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8'))) bank[q.id] = q;
  const scenes = JSON.parse(fs.readFileSync(path.join(seqDir, 'scenes.json'), 'utf8'));
  return { bank, scenes };
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renvoie true si une réponse a été donnée. wrong = répondre faux exprès. */
async function answerCurrent(page, { bank, scenes }, wrong = false) {
  const qa = await page.$('.qa[data-qid]:not(:has(.fb))');
  if (!qa) return false;
  const id = await qa.getAttribute('data-qid');
  const mode = await qa.getAttribute('data-mode');
  const q = bank[id];
  if (!q) throw new Error(`question inconnue ${id}`);
  const scope = page.locator(`.qa[data-qid="${id}"]`);
  if (mode === 'qcm') {
    for (const o of await scope.locator('.op:not([disabled])').all()) {
      const t = (await o.textContent()).slice(1);
      if ((t === q.answer) !== wrong) { await o.click(); return true; }
    }
  } else if (mode === 'write') {
    await scope.locator('.escr input').fill(wrong ? 'zzz' : q.answer);
    await scope.locator('.escr button[type=submit]').click();
  } else if (mode === 'tf') {
    const yes = (q.answer === 'verdadero') !== wrong;
    await scope.locator(yes ? '.vf-si' : '.vf-no').click();
  } else if (mode === 'order') {
    const toks = q.tokens || q.answer.split(/\s+/);
    const seq = wrong ? [...toks].reverse() : toks;
    for (const t of seq) await scope.locator('.banco .ficha', { hasText: new RegExp(`^${esc(t)}$`) }).first().click();
    await scope.locator('.tablero .btn').first().click();
  } else if (mode === 'match') {
    const imgs = q.pairs.map(p => p[1]);
    for (let i = 0; i < q.pairs.length; i++) {
      await scope.locator('.palabra', { hasText: q.pairs[i][0] }).first().click();
      await scope.locator(`.imagen[data-img="${wrong ? imgs[(i + 1) % imgs.length] : q.pairs[i][1]}"]`).click();
    }
    await scope.locator('.tablero .btn').first().click();
  } else if (mode === 'place') {
    const decor = scenes.decors.find(d => d.id === q.scene.decor);
    const items = wrong ? [...q.scene.items].reverse() : q.scene.items;
    const free = new Set(decor.rows.flatMap(r => decor.cols.map(c => `${r[0]}|${c[0]}`)));
    q.scene.items.forEach(it => it.row && it.col && free.delete(`${it.row}|${it.col}`));
    for (let i = 0; i < items.length; i++) {
      const it = q.scene.items[i];
      const target = wrong ? items[i] : it;
      let cell = target.row && target.col ? `${target.row}|${target.col}` : null;
      if (!cell) { cell = [...free].find(c => c.endsWith(`|${target.col}`)) || [...free][0]; free.delete(cell); }
      const es = scenes.objects.find(o => o.id === it.object).es;
      await scope.locator('.pieza', { hasText: es }).first().click();
      await scope.locator(`.celda[data-cell="${cell}"]`).click();
    }
    await scope.locator('.tablero .pie .btn').click();
  } else return false;
  return true;
}

module.exports = { loadBank, answerCurrent };
