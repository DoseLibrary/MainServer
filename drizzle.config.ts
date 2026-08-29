import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ??
      'postgresql://dose:dose-local-change-me@localhost:5432/dose',
  },
  strict: true,
  verbose: true,
});
