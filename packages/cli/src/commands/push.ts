import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

export const pushCommand = new Command("push")
  .description("Push local .env variables to envsync")
  .option("-e, --env <environment>", "Target environment")
  .option("-f, --file <file>", "Source .env file", ".env")
  .option("--no-secret", "Mark variables as non-secret (values visible in list)")
  .action(async (options) => {
    requireToken();
    const config = requireProjectConfig();

    const env = (options.env as string | undefined) ?? config.environment;
    const sourceFile = options.file as string;
    const sourcePath = path.resolve(process.cwd(), sourceFile);
    const isSecret = options.secret !== false;

    if (!fs.existsSync(sourcePath)) {
      console.error(chalk.red(`❌ File not found: ${sourceFile}`));
      process.exit(1);
    }

    const variables = parseEnvFile(sourcePath);
    const keys = Object.keys(variables);

    if (keys.length === 0) {
      console.log(chalk.yellow("⚠️  No variables found in file."));
      return;
    }

    console.log();
    console.log(chalk.bold(`Pushing to ${chalk.cyan(config.project)} / ${chalk.cyan(env)}`));
    console.log(chalk.dim(`  Source: ${sourceFile}  (${keys.length} variables)`));
    console.log();

    const spinner = ora("Uploading...").start();
    try {
      const api = createApiClient();
      const { data } = await api.put(
        `/projects/${config.project}/environments/${env}/variables`,
        { variables, is_secret: isSecret }
      );

      spinner.succeed(
        chalk.green(`Pushed ${chalk.bold(data.count)} variables to ${chalk.bold(env)}`)
      );
      console.log();
      (data.upserted as string[]).forEach((key) => {
        console.log(`  ${chalk.green("✓")} ${key}`);
      });
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Push failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const variables: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Strip surrounding quotes
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
