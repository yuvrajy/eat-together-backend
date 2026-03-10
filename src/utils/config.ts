import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "../../package.json");
    const data = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return data.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export const config = {
  googleMapsApiKey: requireEnv("GOOGLE_MAPS_API_KEY"),
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  version: getVersion(),
};
