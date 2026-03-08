import { registerAs } from "@nestjs/config";

export const appConfig = registerAs("app", () => ({
  port:        parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv:     process.env.NODE_ENV ?? "development",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
}));

export const supabaseConfig = registerAs("supabase", () => ({
  url:            process.env.SUPABASE_URL ?? "",
  anonKey:        process.env.SUPABASE_ANON_KEY ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
}));

export const databaseConfig = registerAs("database", () => ({
  url: process.env.DATABASE_URL ?? "",
}));
