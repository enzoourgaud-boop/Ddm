import { expect, test } from '@playwright/test';
import { loadBank, playToEnd } from './helpers';

const data = loadBank();

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('camino:prefs', JSON.stringify({ sound: false, petals: false, motion: 'reduced' })));
  await page.reload();
});

test('une partie entière, du profil jusqu’au code de fin', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('heading', { name: '¿Quién juega?' })).toBeVisible();
  await page.fill('#pseudo', 'Bot');
  await page.click('text=Créer et jouer');
  await page.fill('input[placeholder="au hasard"]', 'CALAVERA-42');
  await page.getByRole('button', { name: 'Commencer le chemin' }).click();
  const modes = await playToEnd(page, data);
  await expect(page.locator('h1')).toHaveText('¡Felicidades!');
  // le code de fin est affiché, avec son QR
  await expect(page.locator('.codigo')).toHaveText(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{4}$/);
  await expect(page.locator('svg.qr')).toBeVisible();
  // nouveautés débloquées
  await expect(page.locator('.desbloqueos')).toContainText('Nivel de Calavera 1');
  // plusieurs façons de répondre ont été utilisées
  expect(Object.keys(modes).length).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
  // la collection et le carnet sont remplis
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('button', { name: /Lotería \d+\/42/ })).not.toHaveText(/Lotería 0\//);
});

test('espace professeur : code de classe appliqué côté élève', async ({ page, context }) => {
  await page.goto('./#prof');
  await page.fill('#prof-code', 'profe2026');
  await page.click('text=Entrer');
  await page.locator('label.check:has-text("Vocabulario") input').click();
  await page.locator('label.check:has-text("Activer le chrono") input').click();
  const code = (await page.locator('.codigo').textContent())!.trim();
  const eleve = await context.newPage();
  await eleve.goto(`./#classe-${code}`);
  await eleve.fill('#pseudo', 'Élève');
  await eleve.click('text=Créer et jouer');
  await expect(eleve.locator('.clase')).toContainText('Sans chrono');
  await eleve.getByRole('button', { name: 'Commencer le chemin' }).click();
  await eleve.locator('.sala.puede').first().click();
  await expect(eleve.locator('.qa .tag')).not.toHaveText('Vocabulario');
  await expect(eleve.locator('.crono')).toHaveCount(0);
});

test('le jeu fonctionne hors ligne une fois chargé', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker testé sous Chromium');
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.fill('#pseudo', 'Hors ligne');
  await page.click('text=Créer et jouer');
  await page.getByRole('button', { name: 'Commencer le chemin' }).click();
  await page.locator('.sala.puede').first().click();
  await expect(page.locator('.qa[data-qid]')).toBeVisible();
  await context.setOffline(false);
});

test('navigation au clavier : options et première question', async ({ page }) => {
  await page.fill('#pseudo', 'Clavier');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Options/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Options' })).toBeVisible();
  await expect(page.locator('.opciones-panel input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Commencer le chemin' }).focus();
  await page.keyboard.press('Enter');
  // la première salle accessible a le focus : Entrée y entre
  await expect(page.locator('.sala.puede').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.qa[data-qid]')).toBeVisible();
});
