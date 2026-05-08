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
import adminRoutes from "./routes/admin.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRoutes);
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
app.use("/admin", adminRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Playbook backend running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
