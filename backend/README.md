# trip-planner-api

NestJS + Prisma + PostgreSQL — бэкенд «Генератора путешествий».

Все команды в этом файле выполняются из каталога `backend`.

## Требования
- Docker Desktop
- Node.js 18+

## Запуск с нуля

1. Перейдите в каталог backend и установите зависимости:
   ```
   cd backend
   npm install
   ```
2. Скопируйте `.env.example` в `.env` и при желании поменяйте `JWT_SECRET`:
   ```
   cp .env.example .env
   ```
   В `.env.example` уже указаны настройки локальной PostgreSQL из
   `docker-compose.yml`. Для генерации маршрутов также укажите свой
   `GEOAPIFY_API_KEY` в `.env`. Прогноз погоды загружается из Open-Meteo без
   ключа; AI-ассистент включается при настройке `OPENAI_API_KEY` (модель можно
   поменять через `OPENAI_MODEL`).
3. Поднимите PostgreSQL:
   ```
   npm run db:up
   ```
4. Накатите схему:
   ```
   npm run prisma:migrate
   ```
5. Сгенерируйте Prisma Client (обычно делается автоматически после migrate,
   но если что-то ругается на типы — прогоните руками):
   ```
   npm run prisma:generate
   ```
6. Запустите API в режиме разработки:
   ```
   npm run start:dev
   ```
   Поднимется на `http://localhost:3000/api/v1`.

## Запуск после первого раза

После первоначальной настройки достаточно выполнить из `backend`:

```
npm run db:up
npm run start:dev
```

Если схема Prisma изменилась, повторно выполните `npm run prisma:migrate`.

## Prisma Studio

PostgreSQL должна быть запущена через Docker Desktop:

```
npm run db:up
```

Для просмотра и редактирования данных откройте Prisma Studio:

```
npm run prisma:studio
```

Интерфейс будет доступен по адресу `http://localhost:5555`.

## Проверка вручную

```
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"123456"}'
```

В ответе будет `token` — используйте его в заголовке
`Authorization: Bearer <token>` для остальных запросов, например:

```
curl http://localhost:3000/api/v1/trips \
  -H "Authorization: Bearer <token>"
```

## Структура

```
src/
├── auth/         — регистрация, логин, JWT
├── trips/        — CRUD путешествий + запуск генерации
├── trip-days/    — reorder активностей, пересборка дня
├── activities/   — добавление/замена/удаление активностей
├── budget/       — расчёт бюджета
├── assistant/    — заглушка под AI-адаптацию маршрута
├── prisma/       — обёртка над PrismaClient
└── common/       — общие декораторы (CurrentUser)
```

Реальный алгоритм построения маршрута (внешние API мест, фильтрация,
приоритизация, оптимизация переездов) пока не реализован — везде,
где он должен быть, оставлены комментарии `TODO` в
`src/trips/generation.service.ts` и `src/budget/budget.service.ts`.
Сейчас генерация просто создаёт пустые дни по числу ночей, чтобы
можно было уже сейчас гонять фронт против настоящего API.

## Остановить БД
```
npm run db:down
```
