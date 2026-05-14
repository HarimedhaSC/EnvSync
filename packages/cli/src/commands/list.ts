import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

interface Variable {
  key: string;
  value: string;
  is_secret: boolean;
  updated_at: string;
  created_by: { name: string; email: string };
}

export const listCommand = new Command("list")
  .description("List environment variables")
  .option("-e, --env <environment>", "Environment to list")
  .option("--reveal", "Reveal secret values (use carefully)")
  .action(async (options) => {
    requireToken();
    const config = requireProjectConfig();
    const env = (options.env as string | undefined) ?? config.environment;

    const spinner = ora(`Fetching ${chalk.bold(env)} variables...`).start();

    try {
      const api = createApiClient();

      // If --reveal, use the export endpoint which decrypts values
      const endpoint = options.reveal
        ? `/projects/${config.project}/environments/${env}/variables/export`
        : `/projects/${config.project}/environments/${env}/variables`;

      const { data } = await api.get(endpoint);
      spinner.stop();

      if (options.reveal) {
        // Export endpoint returns flat key-value
        const variables: Record<string, string> = data.variables;
        const keys = Object.keys(variables);
        if (keys.length === 0) {
          console.log(chalk.yellow("No variables found."));
          return;
        }
        printHeader(config.project, env, keys.length);
        keys.forEach((key) => {
          console.log(`  ${chalk.cyan(key.padEnd(30))} ${chalk.white(variables[key])}`);
        });
        console.log();
        return;
      }

      const variables: Variable[] = data.variables;

      if (variables.length === 0) {
        console.log(chalk.yellow("No variables found."));
        return;
      }

      printHeader(config.project, env, variables.length);

      // Column widths
      const keyWidth = Math.min(Math.max(...variables.map((v) => v.key.length), 10), 40);

      console.log(
        chalk.dim(
          `  ${"KEY".padEnd(keyWidth)}  ${"VALUE".padEnd(22)}  UPDATED`
        )
      );
      console.log(chalk.dim(`  ${"─".repeat(keyWidth + 40)}`));

      variables.forEach((v) => {
        const value = v.is_secret ? chalk.dim("●●●●●●●●") : chalk.white(v.value);
        const updated = new Date(v.updated_at).toLocaleDateString();
        console.log(
          `  ${chalk.cyan(v.key.padEnd(keyWidth))}  ${value.padEnd(22)}  ${chalk.dim(updated)}`
        );
      });
      console.log();
      if (variables.some((v) => v.is_secret)) {
        console.log(chalk.dim("  Use --reveal to show secret values"));
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

function printHeader(project: string, env: string, count: number): void {
  console.log();
  console.log(
    `  ${chalk.bold(project)} ${chalk.dim("/")} ${chalk.cyan(env)}  ${chalk.dim(`(${count} variables)`)}`
  );
  console.log();
}
