import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  googleMapsApiKey: requireEnv("GOOGLE_MAPS_API_KEY"),
  port: parseInt(process.env["PORT"] ?? "3000", 10),
};
