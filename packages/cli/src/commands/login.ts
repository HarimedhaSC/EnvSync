import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { setToken } from "../utils/config";

export const loginCommand = new Command("login")
  .description("Log in to your envsync account")
  .action(async () => {
    const { email, password } = await inquirer.prompt([
      {
        type: "input",
        name: "email",
        message: "Email:",
        validate: (v) => v.includes("@") || "Enter a valid email",
      },
      {
        type: "password",
        name: "password",
        message: "Password:",
        mask: "*",
      },
    ]);

    const spinner = ora("Logging in...").start();
    try {
      const api = createApiClient();
      const { data } = await api.post("/auth/login", { email, password });
      setToken(data.token, data.user.email);
      spinner.succeed(chalk.green(`Logged in as ${chalk.bold(data.user.email)}`));
    } catch (err) {
      spinner.fail(chalk.red(`Login failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });
