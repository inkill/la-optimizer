# Little Alchemist Deck Optimizer — GitHub Pages Deployment

Веб-приложение для оптимизации колоды Little Alchemist. Работает **полностью на стороне клиента** (статический сайт) — без сервера, без базы данных. Все данные пользователя хранятся в localStorage браузера.

## Быстрый старт

### Вариант 1: Автоматический деплой через GitHub Actions (рекомендуется)

1. **Создайте репозиторий на GitHub** (например, `la-optimizer`)

2. **Запушьте код:**
   ```bash
   git init
   git add .
   git commit -m "Little Alchemist Deck Optimizer"
   git branch -M main
   git remote add origin https://github.com/USERNAME/la-optimizer.git
   git push -u origin main
   ```

3. **Включите GitHub Pages:**
   - Откройте репозиторий → **Settings** → **Pages**
   - В разделе **Build and deployment** → **Source** выберите **GitHub Actions**

4. **Готово!** При каждом пуше в `main` GitHub Actions автоматически соберёт и опубликует сайт.
   - Для репозитория `la-optimizer`: сайт будет на `https://USERNAME.github.io/la-optimizer/`
   - Для репозитория `USERNAME.github.io`: сайт будет на `https://USERNAME.github.io/`

basePath настраивается автоматически в workflow в зависимости от имени репозитория.

---

### Вариант 2: Ручная сборка и деплой

1. **Установите Bun** (или Node.js 20+):
   ```bash
   # Windows
   powershell -c "irm bun.sh/install.ps1 | iex"
   # Linux/Mac
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Установите зависимости:**
   ```bash
   bun install
   ```

3. **Соберите статический экспорт:**
   ```bash
   # Для user pages (username.github.io) или кастомного домена:
   bun run build:static

   # Для project pages (username.github.io/repo-name):
   NEXT_PUBLIC_BASE_PATH="/repo-name" GITHUB_PAGES=true bun run build
   ```

4. **Результат** — папка `out/` со всеми статическими файлами.

5. **Деплой:**
   - Скопируйте содержимое `out/` в корень вашего репозитория GitHub Pages
   - Или используйте любой статический хостинг (Netlify, Vercel, Cloudflare Pages)

---

### Вариант 3: Локальный запуск (dev режим)

```bash
bun install
bun run dev
```
Откройте `http://localhost:3000`

---

## Архитектура

```
public/data/cards.json         ← 278 карт (статичные данные)
public/data/combinations.json  ← 8 824 комбинации (статичные данные)
src/lib/client-store.ts        ← localStorage-хранилище (пользователи, коллекции, колоды)
src/lib/optimizer.ts           ← Алгоритмы оптимизации (quick/advanced/try-all fill)
src/lib/api.ts                 ← API-клиент (читает JSON + localStorage)
src/app/page.tsx               ← Главная страница (5 вкладок)
```

### Данные
- **Каталог карт и комбинаций** — загружается один раз из `/data/*.json` и кэшируется в памяти
- **Пользовательские данные** (аккаунты, коллекции, колоды) — хранятся в `localStorage` браузера
- **Изображения карт** — загружаются с `lil-alchemist.fandom.com` (внешний CDN)

### Функции
- 📚 **Library** — просмотр 278 карт с изображениями, поиск, фильтр по редкости
- 🧪 **Combinations** — поиск комбинаций (одна карта → все комбинации) + рецепт-поиск
- 📦 **Collection** — управление коллекцией (уровень, количество 1-3, fused-чекбоксы)
- 🃏 **Deck Builder** — сборка колоды (до 30 карт, до 3 копий каждой), переключение между 10 колодами
- ⚡ **Optimizer** — оценка колоды + авто-заполнение (Quick/Advanced/Try-All), 4 режима (Sum/Attack/Defence/Heroics)

### Гостевой режим
При первом входе автоматически создаётся гостевая сессия с коллекцией по умолчанию (29 Common + 10 Uncommon + 10 Rare fused карт). Пользователь может сохранить аккаунт (ввести имя) через меню Account в шапке.

---

## Структура файлов для деплоя

```
out/
├── index.html              ← главная страница
├── 404.html                ← страница 404
├── _next/                  ← JS/CSS бандлы
├── data/
│   ├── cards.json          ← 278 карт (55 KB)
│   └── combinations.json   ← 8 824 комбинации (1 MB)
├── logo.svg
└── robots.txt
```

Общий размер: ~2.3 MB

---

## Авторские права

- Excel-калькулятор: **Mr. Andersam**
- Сайт: **inkill**
- Изображения карт: [lil-alchemist.fandom.com](https://lil-alchemist.fandom.com/)
