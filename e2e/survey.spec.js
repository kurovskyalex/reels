const { test, expect } = require('@playwright/test');

// Сбросить сессию между тестами
async function resetSession(page) {
  await page.goto('/test-reset');
}

// Выбрать радио-кнопку через клик на label (input скрыт через opacity:0)
async function selectRadio(page, name, value) {
  await page.locator(`label:has(input[name="${name}"][value="${value}"]) span`).click();
}

// Авторизоваться и дождаться загрузки страницы
async function loginGoogle(page) {
  await page.goto('/test-login');
  await expect(page.locator('#user-info')).toBeVisible({ timeout: 5000 });
}

async function loginYandex(page) {
  await page.goto('/test-login/yandex');
  await expect(page.locator('#user-info')).toBeVisible({ timeout: 5000 });
}

// ── Google: полный сценарий ──────────────────────────────────────────────────

test.describe('Google: полный сценарий', () => {

  test.beforeEach(async ({ page }) => {
    await resetSession(page);
  });

  test('1. Главная страница загружается', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/рилс/i);
    await expect(page.locator('.login-banner')).toBeVisible();
  });

  test('2. Авторизация через Google', async ({ page }) => {
    await loginGoogle(page);
    await expect(page.locator('#user-name')).toHaveText('Test User');
    await expect(page.locator('#login-banner')).toBeHidden();
  });

  test('3. Два видео отображаются на шаге 1', async ({ page }) => {
    await loginGoogle(page);
    const videos = page.locator('video');
    await expect(videos).toHaveCount(2);
    const src1 = await videos.nth(0).locator('source').getAttribute('src');
    const src2 = await videos.nth(1).locator('source').getAttribute('src');
    expect(src1).toBeTruthy();
    expect(src2).toBeTruthy();
  });

  test('4. Шаг 1 → Шаг 2: выбор видео и переход', async ({ page }) => {
    await loginGoogle(page);

    await selectRadio(page, 'q1', 'Видео №1');
    await page.locator('#btn-step1').click();

    await expect(page.locator('#step2')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#step1')).toBeHidden();
  });

  test('5. На шаге 2 показывается только видео №2', async ({ page }) => {
    await loginGoogle(page);

    await selectRadio(page, 'q1', 'Видео №2');
    await page.locator('#btn-step1').click();

    await expect(page.locator('#step2')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.videos-row')).toHaveClass(/step2-mode/);
    await expect(page.locator('.video-card').first()).toBeHidden();
    await expect(page.locator('.video-card').last()).toBeVisible();
  });

  test('6. Полный сценарий: оценки + отправка', async ({ page }) => {
    await loginGoogle(page);

    // Шаг 1
    await selectRadio(page, 'q1', 'Видео №1');
    await page.locator('#btn-step1').click();
    await expect(page.locator('#step2')).toBeVisible({ timeout: 10000 });

    // Шаг 2: ставим оценки
    await selectRadio(page, 'q2', '8');
    await selectRadio(page, 'q3', '7');
    await selectRadio(page, 'q4', '9');
    await selectRadio(page, 'q5', '6');

    await page.locator('#btn-step2').click();

    await expect(page.locator('#success-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.success-title')).toHaveText('Спасибо за ответы!');
  });

  test('7. Нельзя перейти к шагу 2 без выбора видео', async ({ page }) => {
    await loginGoogle(page);

    await page.locator('#btn-step1').click();

    await expect(page.locator('#error-step1')).toBeVisible();
    await expect(page.locator('#step2')).toBeHidden();
  });

  test('8. Нельзя отправить без всех оценок', async ({ page }) => {
    await loginGoogle(page);

    await selectRadio(page, 'q1', 'Видео №2');
    await page.locator('#btn-step1').click();
    await expect(page.locator('#step2')).toBeVisible({ timeout: 10000 });

    // Только 2 оценки из 4
    await selectRadio(page, 'q2', '5');
    await selectRadio(page, 'q3', '5');

    await page.locator('#btn-step2').click();

    await expect(page.locator('#error-step2')).toBeVisible();
    await expect(page.locator('#success-screen')).toBeHidden();
  });

});

// ── Яндекс: полный сценарий ──────────────────────────────────────────────────

test.describe('Яндекс: полный сценарий', () => {

  test.beforeEach(async ({ page }) => {
    await resetSession(page);
  });

  test('1. Авторизация через Яндекс', async ({ page }) => {
    await loginYandex(page);
    await expect(page.locator('#user-name')).toHaveText('Тест Яндекс');
    await expect(page.locator('#login-banner')).toBeHidden();
  });

  test('2. Полный сценарий: Яндекс логин + оценки + отправка', async ({ page }) => {
    await loginYandex(page);

    await selectRadio(page, 'q1', 'Видео №2');
    await page.locator('#btn-step1').click();
    await expect(page.locator('#step2')).toBeVisible({ timeout: 10000 });

    await selectRadio(page, 'q2', '10');
    await selectRadio(page, 'q3', '8');
    await selectRadio(page, 'q4', '7');
    await selectRadio(page, 'q5', '9');

    await page.locator('#btn-step2').click();

    await expect(page.locator('#success-screen')).toBeVisible({ timeout: 10000 });
  });

});

// ── Без авторизации ──────────────────────────────────────────────────────────

test.describe('Без авторизации', () => {

  test.beforeEach(async ({ page }) => {
    await resetSession(page);
  });

  test('Кнопка "Далее" требует авторизацию', async ({ page }) => {
    await page.goto('/');

    await selectRadio(page, 'q1', 'Видео №1');
    await page.locator('#btn-step1').click();

    await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.toast')).toContainText('авторизоваться');
    await expect(page.locator('.login-banner')).toBeVisible();
  });

});
