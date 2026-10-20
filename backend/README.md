# Backend API

Бэкенд «Генератора путешествий»: NestJS, Prisma и PostgreSQL.

## Требования

- Node.js 18+
- Docker Desktop

## Первый запуск

Из корневого каталога проекта перейдите в `backend` и установите зависимости:

```bash
cd backend
npm install
cp .env.example .env
```

В `backend/.env` укажите `GEOAPIFY_API_KEY`, необходимый для поиска мест. Значения `DATABASE_URL` для локальной PostgreSQL уже заданы в `.env.example`. Прогноз Open-Meteo не требует ключа; `OPENAI_API_KEY` необязателен и включает AI-помощника. Файл `.env` не добавляйте в Git.

Оставшись в каталоге `backend`, поднимите базу данных, примените миграции, сгенерируйте Prisma Client и запустите API:

```bash
npm run db:up
npm run prisma:migrate
npm run prisma:generate
npm run start:dev
```

API будет доступен по адресу `http://localhost:3000/api/v1`.

## Повторный запуск

Из каталога `backend` запустите PostgreSQL и API:

```bash
npm run db:up
npm run start:dev
```

Если схема Prisma изменилась, примените миграции командой `npm run prisma:migrate`.

## Prisma Studio

При запущенной PostgreSQL выполните из `backend`:

```bash
npm run prisma:studio
```

Интерфейс откроется на `http://localhost:5555`.

## Тесты и сборка

Из каталога `backend`:

```bash
npm run test:unit
npm run test:e2e
npm run build
```

Перед e2e-тестами скрипт автоматически применяет миграции из `backend/.env.test`; настройте там отдельную тестовую базу данных, не production-базу.

## Проверка API вручную

Зарегистрируйте пользователя:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"123456"}'
```

Используйте полученный `token` для авторизованных запросов:

```bash
curl http://localhost:3000/api/v1/trips \
  -H "Authorization: Bearer <token>"
```

## Остановка базы данных

Из каталога `backend` выполните:

```bash
npm run db:down
```
