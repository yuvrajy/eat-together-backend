import express from "express";
import { config } from "./utils/config";
import suggestRouter from "./routes/suggest";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: config.version, timestamp: new Date().toISOString() });
});

app.use("/api/suggest", suggestRouter);

export default app;
