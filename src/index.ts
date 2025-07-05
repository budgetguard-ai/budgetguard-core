import { buildServer } from "./server.js";
import { execSync } from "node:child_process";

try {
  // Run migrations automatically on startup
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}

const start = async () => {
  const app = await buildServer();
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    app.log.info(`server listening on http://0.0.0.0:3000`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
