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
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

dotenv.config();

// Fail fast on boot rather than surfacing confusing errors on the first request
// that happens to need one of these.
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
  // Not fatal: the app is fully usable without it, and refusing to boot would
  // take the whole site down over a feature nothing user-facing depends on.
  // requireCron fails closed in production, so the routes answer 503 rather
  // than running — this warning says the scheduler's manual overrides are
  // unavailable, not that they are exposed.
  console.error("CRON_SECRET is not set — cron-protected routes (/espn/resolve, /weeks/:id/resolve, etc.) will refuse every request with a 503.");
}

const app = express();

// Railway/Render sit in front of the app behind one reverse proxy hop — this
// makes req.ip resolve to the real client IP (from X-Forwarded-For) instead
// of the proxy's own address, which is required for per-IP rate limiting to
// work at all (without it, every request looks like it comes from one IP).
app.set("trust proxy", 1);

// FRONTEND_URL restricts CORS to the deployed frontend in production. Unset in
// dev, so cors() falls back to reflecting any origin (matches localhost usage).
const allowedOrigins = process.env.FRONTEND_URL?.split(",").map((o) => o.trim());
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());

// Mounted before the rate limiter so platform health checks (which poll
// frequently) can never be throttled or fail a deploy.
app.use("/health", healthRoutes);

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

app.get("/", (req, res) => {
  res.json({ status: "Wagerwolf backend running" });
});

// Last two, and the order matters: the 404 claims anything no router did, and
// the error handler must be registered after every route or Express will not
// route errors to it. See middleware/errorHandler.ts.
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await runStartupSeed();
  await startScheduler();
});

async function shutdown() {
  console.log("Shutting down...");
  server.close();
  await stopScheduler();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
