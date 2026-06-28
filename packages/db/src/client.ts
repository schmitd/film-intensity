import postgres from "postgres";

export function createSqlClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Postgres client.");
  }

  return postgres(connectionString, {
    max: 1,
    prepare: false,
  });
}
