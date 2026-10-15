export interface Env {
  DB: D1Database;
  MCP_BEARER_TOKEN?: string;
  MCP_OWNER_ID?: string;
  MCP_ALLOWED_ORIGIN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
