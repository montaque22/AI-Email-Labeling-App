import pg from "pg";

export const databaseUrl = process.env.DATABASE_URL;

export const dbPool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
    })
  : null;
