import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Sostituisce `package.json#prisma`, deprecato e rimosso in Prisma 7 (vedi
// https://pris.ly/prisma-config). Stessa configurazione di prima (schema +
// comando di seed), solo nel formato che Prisma 7 si aspetterà di trovare.
//
// A differenza del vecchio `package.json#prisma`, la presenza di questo file
// disattiva il caricamento automatico di `.env` da parte della CLI Prisma:
// `dotenv/config` sopra lo ripristina esplicitamente, così `DATABASE_URL`/
// `DIRECT_URL` (letti da `env(...)` nel datasource di schema.prisma)
// continuano a risolversi da `.env` come prima.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx ./prisma/seed.ts",
  },
});
