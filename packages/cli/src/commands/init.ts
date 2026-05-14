import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { createApiClient, formatApiError } from "../utils/api";
import { writeProjectConfig, requireToken } from "../utils/config";

export const initCommand = new Command("init")
  .description("Initialize envsync in the current project")
  .option("-p, --project <slug>", "Project slug")
  .option("-e, --env <environment>", "Default environment", "development")
  .action(async (options) => {
    requireToken();

    let projectSlug = options.project as string | undefined;
    let environment = options.env as string;

    if (!projectSlug) {
      const api = createApiClient();
      let projects: Array<{ name: string; slug: string }> = [];

      try {
        const { data } = await api.get("/projects");
        projects = data.projects;
      } catch (err) {
        console.error(chalk.red(`Failed to fetch projects: ${formatApiError(err)}`));
        process.exit(1);
      }

      if (projects.length === 0) {
        // No projects yet — create one
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Project name:",
            validate: (v) => v.length > 0 || "Required",
          },
          {
            type: "input",
            name: "slug",
            message: "Project slug (e.g. my-app):",
            validate: (v) =>
              /^[a-z0-9-]+$/.test(v) || "Lowercase letters, numbers, hyphens only",
          },
        ]);

        const spinner = ora("Creating project...").start();
        try {
          await api.post("/projects", { name: answers.name, slug: answers.slug });
          spinner.succeed(chalk.green(`Created project ${chalk.bold(answers.slug)}`));
          projectSlug = answers.slug;
        } catch (err) {
          spinner.fail(chalk.red(`Failed to create project: ${formatApiError(err)}`));
          process.exit(1);
        }
      } else {
        const choices = [
          ...projects.map((p) => ({ name: `${p.name} (${p.slug})`, value: p.slug })),
          { name: chalk.cyan("+ Create new project"), value: "__new__" },
        ];

        const { selected } = await inquirer.prompt([
          {
            type: "list",
            name: "selected",
            message: "Select a project:",
            choices,
          },
        ]);

        if (selected === "__new__") {
          const answers = await inquirer.prompt([
            { type: "input", name: "name", message: "Project name:" },
            {
              type: "input",
              name: "slug",
              message: "Project slug:",
              validate: (v) =>
                /^[a-z0-9-]+$/.test(v) || "Lowercase letters, numbers, hyphens only",
            },
          ]);
          const spinner = ora("Creating project...").start();
          try {
            await api.post("/projects", { name: answers.name, slug: answers.slug });
            spinner.succeed(chalk.green(`Created project ${chalk.bold(answers.slug)}`));
            projectSlug = answers.slug;
          } catch (err) {
            spinner.fail(chalk.red(`Failed: ${formatApiError(err)}`));
            process.exit(1);
          }
        } else {
          projectSlug = selected;
        }
      }
    }

    if (!options.env) {
      const { env } = await inquirer.prompt([
        {
          type: "list",
          name: "env",
          message: "Default environment:",
          choices: ["development", "staging", "production"],
          default: "development",
        },
      ]);
      environment = env;
    }

    writeProjectConfig({ project: projectSlug!, environment });

    console.log();
    console.log(chalk.green("✅ Initialized envsync"));
    console.log(chalk.gray(`   Project:     ${chalk.white(projectSlug)}`));
    console.log(chalk.gray(`   Environment: ${chalk.white(environment)}`));
    console.log(chalk.gray(`   Config:      ${chalk.white(".envsync.json")}`));
    console.log();
    console.log(chalk.dim("Add .envsync.json to .gitignore if using personal tokens."));
  });
