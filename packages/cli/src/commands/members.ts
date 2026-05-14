import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { requireToken, requireProjectConfig } from "../utils/config";

export const membersCommand = new Command("members")
  .description("Manage project members and roles");

// envsync members list
membersCommand
  .command("list")
  .description("List all members of the project")
  .action(async () => {
    requireToken();
    const config = requireProjectConfig();
    const spinner = ora("Fetching members...").start();

    try {
      const api = createApiClient();
      const { data } = await api.get(`/projects/${config.project}/members`);
      spinner.stop();

      const members = data.members;

      console.log();
      console.log(chalk.bold(`Members of ${chalk.cyan(config.project)}:`));
      console.log();

      for (const member of members) {
        const roleColor =
          member.role === "admin"
            ? chalk.red
            : member.role === "member"
            ? chalk.green
            : chalk.dim;

        const ownerTag = member.is_owner ? chalk.dim(" (owner)") : "";

        console.log(
          `  ${chalk.bold(member.name.padEnd(20))} ${member.email.padEnd(30)} ${roleColor(
            member.role
          )}${ownerTag}`
        );
      }
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

// envsync members invite <email>
membersCommand
  .command("invite <email>")
  .description("Invite a user to the project by email")
  .option("-r, --role <role>", "Role: admin, member, viewer", "member")
  .action(async (email: string, options) => {
    requireToken();
    const config = requireProjectConfig();
    const spinner = ora(`Inviting ${email}...`).start();

    try {
      const api = createApiClient();
      const { data } = await api.post(`/projects/${config.project}/members`, {
        email,
        role: options.role,
      });
      spinner.stop();

      console.log();
      console.log(
        chalk.green(
          `✅ ${data.member.name} (${data.member.email}) added as ${chalk.bold(data.member.role)}`
        )
      );
      console.log();
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
      process.exit(1);
    }
  });

// envsync members remove <email>
membersCommand
  .command("remove <email>")
  .description("Remove a member from the project")
  .action(async (email: string) => {
    requireToken();
    const config = requireProjectConfig();

    try {
      const api = createApiClient();

      // Look up member id from list
      const { data } = await api.get(`/projects/${config.project}/members`);
      const member = data.members.find((m: { email: string }) => m.email === email);

      if (!member) {
        console.log(chalk.red(`\n❌ No member found with email: ${email}\n`));
        process.exit(1);
      }

      const spinner = ora(`Removing ${email}...`).start();
      await api.delete(`/projects/${config.project}/members/${member.id}`);
      spinner.stop();

      console.log();
      console.log(chalk.green(`✅ ${email} removed from ${config.project}`));
      console.log();
    } catch (err) {
      console.log(chalk.red(`\n❌ Failed: ${formatApiError(err)}\n`));
      process.exit(1);
    }
  });

// envsync members role <email> <role>
membersCommand
  .command("role <email> <role>")
  .description("Change a member's role (admin, member, viewer)")
  .action(async (email: string, role: string) => {
    requireToken();
    const config = requireProjectConfig();

    if (!["admin", "member", "viewer"].includes(role)) {
      console.log(chalk.red(`\n❌ Invalid role: ${role}. Must be admin, member, or viewer.\n`));
      process.exit(1);
    }

    try {
      const api = createApiClient();

      const { data } = await api.get(`/projects/${config.project}/members`);
      const member = data.members.find((m: { email: string }) => m.email === email);

      if (!member) {
        console.log(chalk.red(`\n❌ No member found with email: ${email}\n`));
        process.exit(1);
      }

      const spinner = ora(`Updating role for ${email}...`).start();
      await api.patch(`/projects/${config.project}/members/${member.id}`, { role });
      spinner.stop();

      console.log();
      console.log(chalk.green(`✅ ${email} is now ${chalk.bold(role)}`));
      console.log();
    } catch (err) {
      console.log(chalk.red(`\n❌ Failed: ${formatApiError(err)}\n`));
      process.exit(1);
    }
  });