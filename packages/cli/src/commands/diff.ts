import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

export const diffCommand = new Command("diff")
  .description("Compare your local .env against the server")
  .option("-e, --env <environment>", "Environment to diff against")
  .option("-f, --file <file>", "Local .env file to compare", ".env")
  .action(async (options) => {
    requireToken();
    const config = requireProjectConfig();

    const env = (options.env as string | undefined) ?? config.environment;
    const localFile = options.file as string;
    const localPath = path.resolve(process.cwd(), localFile);

    // Load local .env
    const localVars: Record<string, string> = fs.existsSync(localPath)
      ? parseEnvFile(localPath)
      : {};

    if (!fs.existsSync(localPath)) {
      console.log();
      console.log(chalk.yellow(`⚠️  No local ${localFile} found — showing server variables as all missing locally.`));
      console.log();
    }

    const spinner = ora("Fetching server variables...").start();

    let serverVars: Record<string, string> = {};
    try {
      const api = createApiClient();
      const { data } = await api.get(
        `/projects/${config.project}/environments/${env}/variables/export`
      );
      serverVars = data.variables ?? {};
      spinner.stop();
    } catch (err) {
      spinner.fail(chalk.red(`Failed to fetch server variables: ${formatApiError(err)}`));
      process.exit(1);
    }

    const allKeys = new Set([
      ...Object.keys(localVars),
      ...Object.keys(serverVars),
    ]);

    if (allKeys.size === 0) {
      console.log();
      console.log(chalk.dim("  No variables found locally or on server."));
      console.log();
      return;
    }

    const onlyLocal: string[] = [];
    const onlyServer: string[] = [];
    const changed: string[] = [];
    const same: string[] = [];

    for (const key of Array.from(allKeys).sort()) {
      const local = localVars[key];
      const server = serverVars[key];

      if (local !== undefined && server === undefined) {
        onlyLocal.push(key);
      } else if (local === undefined && server !== undefined) {
        onlyServer.push(key);
      } else if (local !== server) {
        changed.push(key);
      } else {
        same.push(key);
      }
    }

    const hasChanges = onlyLocal.length > 0 || onlyServer.length > 0 || changed.length > 0;

    console.log();
    console.log(
      chalk.bold(`Diff: ${chalk.cyan(config.project)} / ${chalk.cyan(env)}`)
    );
    console.log(
      chalk.dim(`  Local: ${localFile}  ↔  Server: ${env}`)
    );
    console.log();

    // Same
    if (same.length > 0) {
      same.forEach((key) => {
        console.log(`  ${chalk.dim("·")} ${chalk.dim(key)}`);
      });
      console.log();
    }

    // Changed
    if (changed.length > 0) {
      changed.forEach((key) => {
        console.log(`  ${chalk.yellow("~")} ${chalk.yellow(key)}  ${chalk.dim("(different value)")}`);
      });
      console.log();
    }

    // Only on server (you need to pull)
    if (onlyServer.length > 0) {
      onlyServer.forEach((key) => {
        console.log(`  ${chalk.red("-")} ${chalk.red(key)}  ${chalk.dim("(on server, missing locally)")}`);
      });
      console.log();
    }

    // Only local (you need to push)
    if (onlyLocal.length > 0) {
      onlyLocal.forEach((key) => {
        console.log(`  ${chalk.green("+")} ${chalk.green(key)}  ${chalk.dim("(local only, not pushed yet)")}`);
      });
      console.log();
    }

    // Summary
    if (!hasChanges) {
      console.log(chalk.green("✅ Local and server are in sync."));
    } else {
      const parts: string[] = [];
      if (changed.length > 0)
        parts.push(chalk.yellow(`${changed.length} changed`));
      if (onlyServer.length > 0)
        parts.push(chalk.red(`${onlyServer.length} missing locally`));
      if (onlyLocal.length > 0)
        parts.push(chalk.green(`${onlyLocal.length} not pushed`));

      console.log(`${chalk.bold("Summary:")} ${parts.join(chalk.dim("  ·  "))}`);
      console.log();

      if (onlyServer.length > 0) {
        console.log(chalk.dim(`  Run ${chalk.cyan("envsync pull")} to get missing variables.`));
      }
      if (onlyLocal.length > 0) {
        console.log(chalk.dim(`  Run ${chalk.cyan("envsync push")} to upload local-only variables.`));
      }
    }
    console.log();
  });

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