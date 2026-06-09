#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loginCommand } from "./commands/login";
import { initCommand } from "./commands/init";
import { pullCommand } from "./commands/pull";
import { pushCommand } from "./commands/push";
import { listCommand } from "./commands/list";
import { doctorCommand } from "./commands/doctor";
import { schemaCommand } from "./commands/schema";
import { diffCommand } from "./commands/diff";
import { historyCommand } from "./commands/history";
import { membersCommand } from "./commands/members";
import { tokensCommand } from "./commands/tokens";
import { explainCommand } from "./commands/explain";

const program = new Command();

program
  .name("envsync")
  .description(
    chalk.bold("envsync") + " — sync environment variables across teams and machines"
  )
  .version("0.1.0");

program.addCommand(loginCommand);
program.addCommand(initCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(listCommand);
program.addCommand(doctorCommand);
program.addCommand(schemaCommand);
program.addCommand(diffCommand);
program.addCommand(historyCommand);
program.addCommand(membersCommand);
program.addCommand(tokensCommand);
program.addCommand(explainCommand);

// Logout shortcut
program
  .command("logout")
  .description("Log out and clear stored credentials")
  .action(() => {
    const { clearToken } = require("./utils/config");
    clearToken();
    console.log(chalk.green("✅ Logged out"));
  });

// Helpful error for unknown commands
program.on("command:*", (operands) => {
  console.error(chalk.red(`\nUnknown command: ${operands[0]}\n`));
  program.help();
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}