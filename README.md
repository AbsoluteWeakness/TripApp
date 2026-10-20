# Frontend — Генератор путешествий

Фронтенд приложения: React 18, JavaScript и Vite. Исходный код находится в `frontend/src/`.

## Требования

- Node.js `^20.19.0` или `>=22.12.0`
- npm

## Запуск

Из корневого каталога проекта установите зависимости и запустите dev-сервер:

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173`. Изменения в исходниках подхватываются автоматически.

Фронтенд по умолчанию обращается к API по адресу `http://localhost:3000/api/v1`. Для экранов, работающих с API, запустите backend по инструкции в [backend/README.md](backend/README.md).

Чтобы указать другой адрес API, задайте `VITE_API_URL` при запуске:

```bash
VITE_API_URL=http://localhost:3000/api/v1 npm run dev
```

## Проверки и сборка

Все команды выполняются из корневого каталога проекта:

```bash
npm test
npm run lint
npm run build
```

Для локального просмотра production-сборки выполните `npm run preview` после `npm run build`. Собранные файлы появятся в `dist/`.