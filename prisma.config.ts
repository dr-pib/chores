import "dotenv/config";
import { defineConfig } from "prisma/config";

// Railway may expose the PG service URL under several names depending on how
// the service variable is wired. Try the most common ones in order.
function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRIVATE_URL;

  if (!url) {
    throw new Error(
      "No database URL found. Set DATABASE_URL in your environment " +
        "(Railway: add a variable referencing your PostgreSQL service, e.g. ${{Postgres.DATABASE_URL}})"
    );
  }
  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
