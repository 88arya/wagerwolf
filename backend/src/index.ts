import "./instrument";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes";
import userRoutes from "./routes/users.routes";
import leagueRoutes from "./routes/leagues.routes";
import membershipRoutes from "./routes/memberships.routes";
import membershipsRoutes from "./routes/memberships.standalone.routes";
import weekRoutes from "./routes/weeks.routes";
import gameRoutes from "./routes/games.routes";
import playerRoutes from "./routes/players.routes";
import propRoutes from "./routes/props.routes";
import pickRoutes from "./routes/picks.routes";
import syncRoutes from "./routes/sync.routes";
import seasonRoutes from "./routes/season.routes";
import espnRoutes from "./routes/espn.routes";
import gamelineRoutes from "./routes/gamelines.routes";
import gamePickRoutes from "./routes/gamepicks.routes";
import parlayRoutes from "./routes/parlays.routes";
import homeRoutes from "./routes/home.routes";
import supportRoutes from "./routes/support.routes";
import { runStartupSeed } from "./services/startupSeed";
import { startScheduler, stopScheduler } from "./services/scheduler";
import { globalLimiter } from "./middleware/rateLimit";
import { loadShed } from "./middleware/loadShed";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { dbPool } from "./db/db";
import { redisConnection, rateLimitRedis } from "./queue/connection";

dotenv.config();

const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
  console.error("CRON_SECRET is not set — cron-protected routes (/espn/resolve, /weeks/:id/resolve, etc.) will refuse every request with a 503.");
}

const app = express();

// One proxy hop (Caddy), so req.ip is the real client for rate limiting.
app.set("trust proxy", 1);

const allowedOrigins = process.env.FRONTEND_URL?.split(",").map((o) => o.trim());
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());

app.use("/health", healthRoutes);

app.use(loadShed);
app.use(globalLimiter);

app.use("/users", userRoutes);
app.use("/leagues", leagueRoutes);
app.use("/leagues/:id", membershipRoutes);
app.use("/memberships", membershipsRoutes);
app.use("/weeks", weekRoutes);
app.use("/games", gameRoutes);
app.use("/players", playerRoutes);
app.use("/props", propRoutes);
app.use("/picks", pickRoutes);
app.use("/sync", syncRoutes);
app.use("/leagues", seasonRoutes);
app.use("/espn", espnRoutes);
app.use("/gamelines", gamelineRoutes);
app.use("/gamepicks", gamePickRoutes);
app.use("/parlays", parlayRoutes);
app.use("/home", homeRoutes);
app.use("/support", supportRoutes);

app.get("/", (_req, res) => {
  res.json({ status: "Wagerwolf backend running" });
});

// Must be last.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await runStartupSeed();
  await startScheduler();
});

const SHUTDOWN_DEADLINE_MS = 8_000;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down...");
  setTimeout(() => {
    console.error("[shutdown] Deadline passed, exiting with work still open");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();

  // Drain in-flight requests and close idle keep-alive sockets.
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
  await stopScheduler();
  await Promise.allSettled([
    dbPool.end(),
    redisConnection.quit(),
    rateLimitRedis.quit(),
  ]);
  await Sentry.close(2000);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
