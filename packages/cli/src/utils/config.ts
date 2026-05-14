import Conf from "conf";
import path from "path";
import fs from "fs";

interface CliConfig {
  apiUrl: string;
  token?: string;
  userEmail?: string;
}

// Project-local config stored in .envsync.json
interface ProjectConfig {
  project: string;
  environment: string;
}

const globalConfig = new Conf<CliConfig>({
  projectName: "envsync",
  defaults: {
    apiUrl: "http://localhost:3000",
  },
});

// ─── Global config (API URL + auth token) ─────────────────────────────────────

export function getApiUrl(): string {
  return globalConfig.get("apiUrl");
}

export function setApiUrl(url: string): void {
  globalConfig.set("apiUrl", url);
}

export function getToken(): string | undefined {
  return globalConfig.get("token");
}

export function setToken(token: string, email: string): void {
  globalConfig.set("token", token);
  globalConfig.set("userEmail", email);
}

export function clearToken(): void {
  globalConfig.delete("token");
  globalConfig.delete("userEmail");
}

export function getStoredEmail(): string | undefined {
  return globalConfig.get("userEmail");
}

// ─── Project-local config (.envsync.json) ─────────────────────────────────────

const PROJECT_CONFIG_FILE = ".envsync.json";

export function getProjectConfig(): ProjectConfig | null {
  const configPath = path.resolve(process.cwd(), PROJECT_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

export function writeProjectConfig(config: ProjectConfig): void {
  const configPath = path.resolve(process.cwd(), PROJECT_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function requireProjectConfig(): ProjectConfig {
  const config = getProjectConfig();
  if (!config) {
    console.error(
      "❌ No .envsync.json found. Run \`envsync init\` first."
    );
    process.exit(1);
  }
  return config;
}

export function requireToken(): string {
  const token = getToken();
  if (!token) {
    console.error(
      "❌ Not logged in. Run \`envsync login\` first."
    );
    process.exit(1);
  }
  return token;
}
