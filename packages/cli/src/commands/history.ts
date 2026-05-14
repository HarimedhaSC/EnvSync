import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

interface HistoryEntry {
  id: string;
  key: string;
  action: "created" | "updated" | "deleted";
  changed_at: string;
  changed_by: {
    name: string;
    email: string;
  };
}

export const historyCommand = new Command("history")
  .description("Show the audit trail of variable changes")
  .argument("[key]", "Filter history for a specific variable")
  .option("-e, --env <environment>", "Environment to query")
  .action(async (key: string | undefined, options) => {
    requireToken();
    const config = requireProjectConfig();

    const env = (options.env as string | undefined) ?? config.environment;

    const spinner = ora("Fetching history...").start();

    try {
      const api = createApiClient();
      const url = key
        ? `/projects/${config.project}/environments/${env}/history?key=${encodeURIComponent(key)}`
        : `/projects/${config.project}/environments/${env}/history`;

      const { data } = await api.get(url);
      const history: HistoryEntry[] = data.history;
      spinner.stop();

      console.log();
      console.log(
        chalk.bold(
          `History: ${chalk.cyan(config.project)} / ${chalk.cyan(env)}` +
            (key ? `  ·  ${chalk.yellow(key)}` : "")
        )
      );
      console.log();

      if (history.length === 0) {
        console.log(chalk.dim("  No history found."));
        console.log();
        return;
      }

      // Group by date
      let lastDate = "";

      for (const entry of history) {
        const date = new Date(entry.changed_at);
        const dateStr = date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const timeStr = date.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Print date header when it changes
        if (dateStr !== lastDate) {
          if (lastDate !== "") console.log();
          console.log(chalk.dim(`  ── ${dateStr} ──────────────────────`));
          lastDate = dateStr;
        }

        const actionColor =
          entry.action === "created"
            ? chalk.green
            : entry.action === "deleted"
            ? chalk.red
            : chalk.yellow;

        const actionLabel =
          entry.action === "created"
            ? "created"
            : entry.action === "deleted"
            ? "deleted"
            : "updated";

        console.log(
          `  ${actionColor("●")} ${chalk.bold(entry.key.padEnd(28))} ${actionColor(
            actionLabel.padEnd(8)
          )} ${chalk.dim(timeStr)}  ${chalk.dim(entry.changed_by.name)}`
        );
      }

      console.log();
      console.log(chalk.dim(`  ${history.length} event${history.length !== 1 ? "s" : ""} total`));
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed to fetch history: ${formatApiError(err)}`));
      process.exit(1);
    }
  });