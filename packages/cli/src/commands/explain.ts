import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

export const explainCommand = new Command("explain")
  .description("Use AI to explain what an environment variable does")
  .argument("<key>", "Variable name to explain (e.g. STRIPE_SECRET_KEY)")
  .option("-e, --env <environment>", "Environment to read from")
  .action(async (key: string, options) => {
    requireToken();
    const config = requireProjectConfig();
    const env = (options.env as string | undefined) ?? config.environment;

    // Load local .env for context
    const envPath = path.resolve(process.cwd(), ".env");
    const localVars = fs.existsSync(envPath) ? parseEnvFile(envPath) : {};
    const localValue = localVars[key];

    // Load schema for context
    const schemaPath = path.resolve(process.cwd(), ".envsync.schema.json");
    let schemaRule: Record<string, unknown> | null = null;
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
        schemaRule = schema.variables?.[key] ?? null;
      } catch {
        // ignore
      }
    }

    // Fetch server variable list for context (just keys, not values)
    let serverKeys: string[] = [];
    try {
      const api = createApiClient();
      const { data } = await api.get(
        `/projects/${config.project}/environments/${env}/variables`
      );
      serverKeys = (data.variables ?? []).map((v: { key: string }) => v.key);
    } catch {
      // non-fatal, continue without server context
    }

    const spinner = ora(`Asking Gemini about ${chalk.cyan(key)}...`).start();

    try {
      // Build context for the AI
      const context = buildContext({
        key,
        localValue,
        schemaRule,
        serverKeys,
        project: config.project,
        env,
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY ?? ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an expert DevOps engineer helping developers understand their environment variables.
Be concise, practical, and specific. Structure your response with these sections:
1. What it does (1-2 sentences)
2. Common values / format
3. Security notes (if sensitive)
4. Potential issues (if any based on the current value)
Use plain text, no markdown headers, keep it under 200 words.

${context}`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message ?? "API request failed");
      }

      const data = await response.json() as {
        candidates: Array<{
          content: { parts: Array<{ text: string }> };
        }>;
      };
      const text = data.candidates[0].content.parts
        .map((p) => p.text)
        .join("");

      spinner.stop();

      console.log();
      console.log(
        `${chalk.bold("envsync explain")} ${chalk.cyan(key)}`
      );
      console.log(chalk.dim(`  Project: ${config.project}  ·  Environment: ${env}`));
      console.log();

      // Print current value (masked if looks sensitive)
      if (localValue !== undefined) {
        const masked = isSensitive(key)
          ? localValue.substring(0, 6) + "..." + localValue.slice(-4)
          : localValue;
        console.log(`  ${chalk.dim("Current value:")} ${chalk.yellow(masked)}`);
        console.log();
      } else {
        console.log(`  ${chalk.dim("Current value:")} ${chalk.red("not set locally")}`);
        console.log();
      }

      // Print schema info if available
      if (schemaRule) {
        const type = schemaRule.type ? chalk.cyan(schemaRule.type as string) : null;
        const allowed = schemaRule.allowed
          ? chalk.dim(`[${(schemaRule.allowed as string[]).join(", ")}]`)
          : null;
        const required = schemaRule.required !== false ? chalk.red("required") : chalk.dim("optional");
        const tags = [required, type, allowed].filter(Boolean).join(chalk.dim(" · "));
        console.log(`  ${chalk.dim("Schema:")} ${tags}`);
        console.log();
      }

      // Print AI explanation
      const lines = text.trim().split("\n");
      lines.forEach((line) => {
        console.log(`  ${line}`);
      });
      console.log();
    } catch (err: unknown) {
      spinner.fail(
        chalk.red(
          `Failed to explain: ${err instanceof Error ? err.message : formatApiError(err)}`
        )
      );

      if (err instanceof Error && err.message.includes("GEMINI_API_KEY")) {
        console.log();
        console.log(
          chalk.dim(`  Set your Gemini API key: GEMINI_API_KEY=your_key_here`)
        );
        console.log();
      }

      process.exit(1);
    }
  });

function buildContext(opts: {
  key: string;
  localValue: string | undefined;
  schemaRule: Record<string, unknown> | null;
  serverKeys: string[];
  project: string;
  env: string;
}): string {
  const parts: string[] = [
    `I have an environment variable named "${opts.key}" in a project called "${opts.project}" (${opts.env} environment).`,
  ];

  if (opts.localValue !== undefined) {
    if (isSensitive(opts.key)) {
      parts.push(`It is currently set (value hidden for security).`);
    } else {
      parts.push(`Its current value is: "${opts.localValue}".`);
    }
  } else {
    parts.push(`It is not currently set locally.`);
  }

  if (opts.schemaRule) {
    parts.push(`Schema definition: ${JSON.stringify(opts.schemaRule)}.`);
  }

  if (opts.serverKeys.length > 0) {
    parts.push(
      `Other variables in this project: ${opts.serverKeys
        .filter((k) => k !== opts.key)
        .slice(0, 10)
        .join(", ")}.`
    );
  }

  parts.push(
    `Please explain what this environment variable does, its expected format, any security considerations, and flag any potential issues with the current value.`
  );

  return parts.join(" ");
}

function isSensitive(key: string): boolean {
  const sensitivePatterns = [
    "secret", "key", "token", "password", "pass", "pwd",
    "auth", "credential", "private", "cert", "api_key",
  ];
  const lower = key.toLowerCase();
  return sensitivePatterns.some((p) => lower.includes(p));
}

function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const variables: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) variables[key] = value;
  }
  return variables;
}