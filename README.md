![Backend tests](https://github.com/AbsoluteWeakness/TripApp/actions/workflows/backend-tests.yml/badge.svg)

# Генератор путешествий

Приложение состоит из React/Vite-фронтенда, NestJS API и PostgreSQL.

## Требования

- Node.js 18+
- Docker Desktop

## Первый запуск

Откройте папку `trip-planner-app` в VS Code и выполните команды ниже.

### 1. Подготовьте backend

В первом терминале:

```bash
cd backend
npm install
cp .env.example .env
npm run db:up
npm run prisma:migrate
npm run prisma:generate
npm run start:dev
```

Перед запуском генерации вставьте свой `GEOAPIFY_API_KEY` в `backend/.env`.
Файл `.env` не добавляется в Git.

API будет доступен по адресу `http://localhost:3000/api/v1`.

PostgreSQL запускается командой `npm run db:up` через Docker Desktop. Чтобы
открыть интерфейс Prisma Studio для просмотра базы данных, оставьте PostgreSQL
запущенной и выполните во втором терминале:

```bash
cd backend
npm run prisma:studio
```

Prisma Studio откроется по адресу `http://localhost:5555`.

### 2. Запустите frontend

Во втором терминале, из корня проекта:

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173`.

Фронтенд по умолчанию обращается к API по адресу
`http://localhost:3000/api/v1`. При необходимости его можно изменить через
`VITE_API_URL`, например:

```bash
VITE_API_URL=http://localhost:3000/api/v1 npm run dev
```

Изменения в коде подхватываются автоматически (hot reload). Основные файлы
фронтенда находятся в `frontend/src/`.

## Остановка

Остановите dev-серверы сочетанием `Ctrl+C`, затем при необходимости выключите
PostgreSQL:

```bash
cd backend
npm run db:down
```

Подробные команды API и Prisma находятся в [backend/README.md](backend/README.md).
