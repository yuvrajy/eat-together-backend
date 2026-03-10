import express from "express";
import { config } from "./utils/config";
import { runPreflight } from "./utils/preflight";
import suggestRouter from "./routes/suggest";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: config.version, timestamp: new Date().toISOString() });
});

app.use("/api/suggest", suggestRouter);

runPreflight()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`EatTogether server listening on port ${config.port}`);
    });
  })
  .catch((err: Error) => {
    console.error(`\nStartup failed: ${err.message}`);
    process.exit(1);
  });

export default app;
