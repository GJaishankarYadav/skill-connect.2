# SkillConnect

SkillConnect is a React/Vite frontend with an Express API, PostgreSQL data storage,
and Firebase Authentication.

## Deploy to Render

1. Push this repository to GitHub and select **New → Blueprint** in Render.
2. Connect the repository and let Render apply [`render.yaml`](./render.yaml).
   The Blueprint creates a web service and PostgreSQL database.
3. Optionally enter `GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` when
   prompted. Maps remain optional; restrict the Google Maps key to your app's
   domains and required APIs.
4. Add the deployed Render hostname to the authorized domains in Firebase
   Authentication. The app uses the Firebase project configured in
   `firebase-applet-config.json`.
5. Visit the service's `/api/health` endpoint to confirm it is healthy.

The Render start command applies the Drizzle schema to PostgreSQL before starting
the app. The platform owner account is currently `skillconnect751@gmail.com`;
sign in with that verified Firebase account to manage administrator access.

The Blueprint uses free plans for both services. Render's free web service can
spin down when idle, and free PostgreSQL databases are temporary; use a paid
database plan for persistent production data.

## Run locally

Requirements: Node.js 22.12 or newer and a PostgreSQL database.

```bash
npm ci
cp .env.example .env
# Fill in the PostgreSQL connection values in .env.
npm run db:push
npm run dev
```

Open `http://localhost:3000`. To create a production build, run `npm run build`;
`npm start` serves that build when `dist/` exists and `NODE_ENV=production`.

## Configuration

- `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, and `SQL_PASSWORD` configure the app's
  PostgreSQL connection.
- `SQL_ADMIN_USER` and `SQL_ADMIN_PASSWORD` are used by Drizzle Kit when applying
  the schema. The Render Blueprint maps these to the provisioned database user.
- `SQL_PORT` and `SQL_SSL=true` are optional and enable TLS connections to
  external PostgreSQL hosts such as Supabase (`SQL_PORT=5432` or `6543`).
- `GOOGLE_MAPS_API_KEY` enables server-side map lookups, and
  `VITE_GOOGLE_MAPS_API_KEY` enables the map UI. Both are optional.
- Firebase client settings are read from `firebase-applet-config.json`. Firebase
  Authentication must allow the deployed hostname.

## Create Database in Supabase

1. Create a project in [Supabase](https://supabase.com) and open **SQL Editor → New Query**.
2. Paste and run [`supabase/schema.sql`](./supabase/schema.sql) to create all 15 SkillConnect tables, indexes, foreign keys, and starter courses/workshops.
3. Alternatively, copy your Supabase Postgres host, port (`5432` or `6543`), database (`postgres`), user, and password into `.env` (`SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`, `SQL_SSL=true`) and run `npm run db:push`.

The repository also contains legacy PHP/MySQL files, which are not used by the
React/Express application deployed by the Render Blueprint.
