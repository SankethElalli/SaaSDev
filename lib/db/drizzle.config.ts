import { defineConfig } from "drizzle-kit";
import { getConnectionConfig } from "./src/connection";

const config = getConnectionConfig();

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: config.connectionString
    ? { url: config.connectionString }
    : {
        host: config.host!,
        port: config.port!,
        user: config.user!,
        password: config.password!,
        database: config.database!,
        ssl: config.ssl ?? false,
      },
});
