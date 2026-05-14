import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

export const tokensCommand = new Command("tokens")
  .description("Manage CI/CD API tokens");

// envsync tokens list
tokensCommand
  .command("list")
  .description("List all API tokens for the project")
  .action(async () => {
    requireToken();
    const config = requireProjectConfig();
    const spinner = ora("Fetching tokens...").start();

    try {
      const api = createApiClient();
      const { data } = await api.get(`/projects/${config.project}/tokens`);
      spinner.stop();

      const tokens = data.tokens;

      console.log();
      console.log(chalk.bold(`API tokens for ${chalk.cyan(config.project)}:`));
      console.log();

      if (tokens.length === 0) {
        console.log(chalk.dim("  No tokens found."));
        console.log(chalk.dim(`  Run ${chalk.cyan("envsync tokens create <name>")} to create one.`));
        console.log();
        return;
      }

      for (const token of tokens) {
        const expires = token.expires_at
          ? chalk.dim(`expires ${new Date(token.expires_at).toLocaleDateString()}`)
          : chalk.dim("never expires");

        const lastUsed = token.last_used_at
          ? chalk.dim(`last used ${new Date(token.last_used_at).toLocaleDateString()}`)
          : chalk.dim("never used");

        console.log(`  ${chalk.bold(token.name.padEnd(24))} ${chalk.cyan(token.token_prefix + "...")}  ${expires}  ${lastUsed}`);
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

// envsync tokens create <name>
tokensCommand
  .command("create <name>")
  .description("Create a new CI/CD API token")
  .option("-d, --expires-in <days>", "Token expiry in days")
  .action(async (name: string, options) => {
    requireToken();
    const config = requireProjectConfig();
    const spinner = ora("Creating token...").start();

    try {
      const api = createApiClient();
      const body: Record<string, unknown> = { name };
      if (options.expiresIn) body.expires_in_days = parseInt(options.expiresIn, 10);

      const { data } = await api.post(`/projects/${config.project}/tokens`, body);
      spinner.stop();

      console.log();
      console.log(chalk.green(`✅ Token created: ${chalk.bold(name)}`));
      console.log();
      console.log(`  ${chalk.bold("Token:")} ${chalk.cyan(data.raw_token)}`);
      console.log();
      console.log(chalk.yellow(`  ⚠️  ${data.warning}`));
      console.log();
      console.log(chalk.dim("  Use this token in GitHub Actions:"));
      console.log(chalk.dim(`  ENVSYNC_TOKEN: \${{ secrets.ENVSYNC_TOKEN }}`));
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

// envsync tokens revoke <name>
tokensCommand
  .command("revoke <name>")
  .description("Revoke an API token by name")
  .action(async (name: string) => {
    requireToken();
    const config = requireProjectConfig();

    try {
      const api = createApiClient();

      const { data } = await api.get(`/projects/${config.project}/tokens`);
      const token = data.tokens.find((t: { name: string }) => t.name === name);

      if (!token) {
        console.log(chalk.red(`\n❌ No token found with name: ${name}\n`));
        process.exit(1);
      }

      const spinner = ora(`Revoking ${name}...`).start();
      await api.delete(`/projects/${config.project}/tokens/${token.id}`);
      spinner.stop();

      console.log();
      console.log(chalk.green(`✅ Token "${name}" revoked`));
      console.log();
    } catch (err) {
      console.log(chalk.red(`\n❌ Failed: ${formatApiError(err)}\n`));
      process.exit(1);
    }
  });