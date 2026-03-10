import app from "./app";
import { config } from "./utils/config";
import { runPreflight } from "./utils/preflight";

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
