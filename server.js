require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const { randomBytes } = require('crypto');

// Падаем при старте если критичные переменные не заданы
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!GOOGLE_CLIENT_ID) throw new Error('Не задана переменная GOOGLE_CLIENT_ID в .env');
if (!GOOGLE_CLIENT_SECRET) throw new Error('Не задана переменная GOOGLE_CLIENT_SECRET в .env');
if (!SESSION_SECRET) throw new Error('Не задана переменная SESSION_SECRET в .env — задайте любую длинную случайную строку');

const app = express();
const PORT = process.env.PORT || 3000;
const SHEETS_WEBHOOK = process.env.GOOGLE_SHEETS_WEBHOOK;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET;
const YANDEX_REDIRECT_URI = process.env.YANDEX_REDIRECT_URI || `http://localhost:${PORT}/auth/yandex/callback`;

// Допустимые значения ответов — строгий белый список
const VALID_ANSWERS = new Set(['Видео №1', 'Видео №2']);
const QUESTION_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'];

app.set('trust proxy', 1); // Railway использует reverse proxy
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(cookieSession({
  name: 'session',
  keys: [SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
}));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  // API-запросы возвращают 401, страницы — редирект
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.redirect('/login');
}

// Главная страница — доступна всем
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Перенаправление на Google OAuth
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');

  const state = randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Перенаправление на Яндекс OAuth
app.get('/login/yandex', (req, res) => {
  if (req.session.user) return res.redirect('/');

  const state = randomBytes(16).toString('hex');
  req.session.yandexOauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: YANDEX_REDIRECT_URI,
    state,
    force_confirm: 'yes',
  });

  res.redirect(`https://oauth.yandex.ru/authorize?${params}`);
});

// Callback после Яндекс OAuth
app.get('/auth/yandex/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.status(400).send('Код авторизации отсутствует');
  if (state !== req.session.yandexOauthState) return res.status(400).send('Ошибка безопасности: state не совпадает');

  delete req.session.yandexOauthState;

  try {
    const tokenRes = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: YANDEX_CLIENT_ID,
        client_secret: YANDEX_CLIENT_SECRET,
        redirect_uri: YANDEX_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Ошибка токена Яндекс:', tokenData);
      return res.status(500).send('Ошибка аутентификации через Яндекс');
    }

    const userRes = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${tokenData.access_token}` },
    });

    const user = await userRes.json();

    req.session.user = {
      email: user.default_email,
      name: user.real_name || user.display_name || user.login,
      picture: user.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${user.default_avatar_id}/islands-75`
        : null,
    };

    res.redirect('/');
  } catch (err) {
    console.error('Яндекс OAuth ошибка:', err);
    res.status(500).send('Ошибка аутентификации через Яндекс');
  }
});

// Callback после Google OAuth
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) return res.status(400).send('Код авторизации отсутствует');
  if (state !== req.session.oauthState) return res.status(400).send('Ошибка безопасности: state не совпадает');

  delete req.session.oauthState;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error('Ошибка токена:', tokenData);
      return res.status(500).send('Ошибка аутентификации. Проверьте настройки Google Cloud.');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const user = await userRes.json();

    req.session.user = {
      email: user.email,
      name: user.name,
      picture: user.picture,
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth ошибка:', err);
    res.status(500).send('Ошибка аутентификации');
  }
});

// API: данные текущего пользователя
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Не авторизован' });
  res.json(req.session.user);
});

// API: отправка ответов в Google Sheets
app.post('/api/submit', requireAuth, async (req, res) => {
  // Защита от повторной отправки одним пользователем
  if (req.session.submitted) {
    return res.status(409).json({ error: 'Вы уже отправили ответы' });
  }

  const { answers } = req.body;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  // Строгая проверка: только допустимые значения из белого списка
  for (const key of QUESTION_KEYS) {
    if (!VALID_ANSWERS.has(answers[key])) {
      return res.status(400).json({ error: `Недопустимое значение для вопроса ${key}` });
    }
  }

  const { email, name } = req.session.user;

  const payload = {
    timestamp: new Date().toLocaleString('ru-RU'),
    email,
    name,
    q1: answers.q1,
    q2: answers.q2,
    q3: answers.q3,
    q4: answers.q4,
    q5: answers.q5,
  };

  if (!SHEETS_WEBHOOK) {
    console.log('Ответы (webhook не настроен):', payload);
    req.session.submitted = true;
    return res.json({ ok: true });
  }

  try {
    // Apps Script возвращает 302 redirect — следуем вручную чтобы сохранить метод POST
    const firstRes = await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify(payload),
    });

    let sheetsRes;
    if (firstRes.status === 301 || firstRes.status === 302) {
      const redirectUrl = firstRes.headers.get('location');
      sheetsRes = await fetch(redirectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      sheetsRes = firstRes;
    }

    if (!sheetsRes.ok) {
      console.error('Ошибка Sheets:', await sheetsRes.text());
      return res.status(500).json({ error: 'Не удалось сохранить ответы' });
    }

    // Помечаем сессию как «уже отправлено» только после успеха
    req.session.submitted = true;
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка отправки в Sheets:', err);
    res.status(500).json({ error: 'Ошибка подключения к Google Sheets' });
  }
});

// Выход
app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
