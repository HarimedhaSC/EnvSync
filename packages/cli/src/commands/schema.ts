import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { requireProjectConfig } from "../utils/config";
import { EnvSchema } from "./doctor";

const SCHEMA_FILE = ".envsync.schema.json";

export const schemaCommand = new Command("schema")
  .description("Manage the environment variable schema");

// envsync schema init
schemaCommand
  .command("init")
  .description("Create a starter .envsync.schema.json from your current .env")
  .option("-f, --file <file>", "Source .env file", ".env")
  .action((options) => {
    requireProjectConfig();

    const schemaPath = path.resolve(process.cwd(), SCHEMA_FILE);
    const envPath = path.resolve(process.cwd(), options.file as string);

    if (fs.existsSync(schemaPath)) {
      console.log();
      console.log(chalk.yellow(`⚠️  ${SCHEMA_FILE} already exists.`));
      console.log(chalk.dim("  Delete it first if you want to regenerate."));
      console.log();
      process.exit(1);
    }

    // Build schema from existing .env if present
    const variables: EnvSchema["variables"] = {};

    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        if (key) {
          variables[key] = {
            required: true,
            type: "string",
            description: "",
          };
        }
      }
      console.log();
      console.log(
        chalk.dim(
          `  Detected ${Object.keys(variables).length} variables from ${options.file}`
        )
      );
    } else {
      // Empty starter schema
      variables["EXAMPLE_VAR"] = {
        required: true,
        type: "string",
        description: "An example variable",
        example: "my-value",
      };
    }

    const schema: EnvSchema = { version: 1, variables };
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n");

    console.log();
    console.log(chalk.green(`✅ Created ${SCHEMA_FILE}`));
    console.log();
    console.log(chalk.dim("  Edit the schema to add types, allowed values, and descriptions:"));
    console.log();
    console.log(
      chalk.dim(
`  {
    "version": 1,
    "variables": {
      "NODE_ENV": {
        "required": true,
        "type": "string",
        "allowed": ["development", "staging", "production"],
        "description": "Runtime environment"
      },
      "PORT": {
        "required": true,
        "type": "number",
        "description": "Port the server listens on",
        "example": "3000"
      }
    }
  }`
      )
    );
    console.log();
    console.log(
      chalk.dim(`  Then run ${chalk.cyan("envsync doctor")} to validate your .env.`)
    );
    console.log();
  });

// envsync schema show
schemaCommand
  .command("show")
  .description("Print the current schema")
  .action(() => {
    requireProjectConfig();

    const schemaPath = path.resolve(process.cwd(), SCHEMA_FILE);

    if (!fs.existsSync(schemaPath)) {
      console.log();
      console.log(chalk.yellow("⚠️  No schema found."));
      console.log(
        chalk.dim(`  Run ${chalk.cyan("envsync schema init")} to create one.`)
      );
      console.log();
      process.exit(1);
    }

    let schema: EnvSchema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    } catch {
      console.log(chalk.red("❌ Failed to parse .envsync.schema.json — invalid JSON."));
      process.exit(1);
    }

    console.log();
    console.log(chalk.bold(`Schema for this project (${Object.keys(schema.variables).length} variables):`));
    console.log();

    for (const [key, rule] of Object.entries(schema.variables)) {
      const tags = [
        rule.required !== false ? chalk.red("required") : chalk.dim("optional"),
        rule.type ? chalk.cyan(rule.type) : null,
        rule.allowed ? chalk.dim(`[${rule.allowed.join(", ")}]`) : null,
      ]
        .filter(Boolean)
        .join(chalk.dim(" · "));

      console.log(`  ${chalk.bold(key)}  ${tags}`);
      if (rule.description) {
        console.log(`    ${chalk.dim(rule.description)}`);
      }
      if (rule.example) {
        console.log(`    ${chalk.dim(`example: ${rule.example}`)}`);
      }
    }
    console.log();
  });