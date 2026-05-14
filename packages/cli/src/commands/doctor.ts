import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { requireProjectConfig } from "../utils/config";

const SCHEMA_FILE = ".envsync.schema.json";

export interface VariableSchema {
  required?: boolean;
  type?: "string" | "number" | "boolean" | "url" | "email";
  allowed?: string[];
  description?: string;
  example?: string;
}

export interface EnvSchema {
  version: 1;
  variables: Record<string, VariableSchema>;
}

export const doctorCommand = new Command("doctor")
  .description("Validate your .env file against the project schema")
  .option("-f, --file <file>", "Source .env file", ".env")
  .action((options) => {
    requireProjectConfig();

    const schemaPath = path.resolve(process.cwd(), SCHEMA_FILE);
    const envPath = path.resolve(process.cwd(), options.file as string);

    // Check schema exists
    if (!fs.existsSync(schemaPath)) {
      console.log();
      console.log(chalk.yellow("⚠️  No schema found."));
      console.log(
        chalk.dim(`  Run ${chalk.cyan("envsync schema init")} to create one.`)
      );
      console.log();
      process.exit(1);
    }

    // Check .env exists
    if (!fs.existsSync(envPath)) {
      console.log();
      console.log(chalk.red(`❌ File not found: ${options.file}`));
      console.log(
        chalk.dim(`  Run ${chalk.cyan("envsync pull")} to fetch your variables.`)
      );
      console.log();
      process.exit(1);
    }

    // Load schema
    let schema: EnvSchema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    } catch {
      console.log(chalk.red("❌ Failed to parse .envsync.schema.json — invalid JSON."));
      process.exit(1);
    }

    // Load .env
    const envVars = parseEnvFile(envPath);

    console.log();
    console.log(chalk.bold("Running envsync doctor..."));
    console.log(chalk.dim(`  Schema: ${SCHEMA_FILE}`));
    console.log(chalk.dim(`  Env file: ${options.file}`));
    console.log();

    const errors: string[] = [];
    const warnings: string[] = [];
    const passed: string[] = [];

    for (const [key, rule] of Object.entries(schema.variables)) {
      const value = envVars[key];

      // Missing required variable
      if (value === undefined || value === "") {
        if (rule.required !== false) {
          errors.push(
            `${chalk.red("✖")} ${chalk.bold(key)} — ${chalk.red("missing")}${
              rule.description ? chalk.dim(` (${rule.description})`) : ""
            }${rule.example ? chalk.dim(`\n    example: ${rule.example}`) : ""}`
          );
        } else {
          warnings.push(
            `${chalk.yellow("⚠")} ${chalk.bold(key)} — ${chalk.yellow("not set")} (optional)${
              rule.description ? chalk.dim(` — ${rule.description}`) : ""
            }`
          );
        }
        continue;
      }

      // Type checks
      if (rule.type) {
        const typeError = checkType(key, value, rule.type);
        if (typeError) {
          errors.push(typeError);
          continue;
        }
      }

      // Allowed values check
      if (rule.allowed && !rule.allowed.includes(value)) {
        errors.push(
          `${chalk.red("✖")} ${chalk.bold(key)} — invalid value ${chalk.red(
            `"${value}"`
          )}\n    allowed: ${rule.allowed.map((v) => chalk.cyan(v)).join(", ")}`
        );
        continue;
      }

      passed.push(`${chalk.green("✓")} ${chalk.bold(key)}`);
    }

    // Print results
    if (passed.length > 0) {
      passed.forEach((msg) => console.log(`  ${msg}`));
      console.log();
    }

    if (warnings.length > 0) {
      warnings.forEach((msg) => console.log(`  ${msg}`));
      console.log();
    }

    if (errors.length > 0) {
      errors.forEach((msg) => console.log(`  ${msg}`));
      console.log();
      console.log(
        chalk.red(
          `❌ Found ${errors.length} error${errors.length > 1 ? "s" : ""}` +
            (warnings.length > 0 ? ` and ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "")
        )
      );
      console.log();
      process.exit(1);
    }

    console.log(
      chalk.green(
        `✅ All good! ${passed.length} variable${passed.length > 1 ? "s" : ""} passed` +
          (warnings.length > 0
            ? chalk.yellow(` (${warnings.length} optional warning${warnings.length > 1 ? "s" : ""})`)
            : "")
      )
    );
    console.log();
  });

function checkType(key: string, value: string, type: string): string | null {
  switch (type) {
    case "number":
      if (isNaN(Number(value))) {
        return `${chalk.red("✖")} ${chalk.bold(key)} — expected ${chalk.cyan(
          "number"
        )}, got ${chalk.red(`"${value}"`)}`; 
      }
      break;
    case "boolean":
      if (!["true", "false", "1", "0"].includes(value.toLowerCase())) {
        return `${chalk.red("✖")} ${chalk.bold(key)} — expected ${chalk.cyan(
          "boolean"
        )} (true/false/1/0), got ${chalk.red(`"${value}"`)}`;
      }
      break;
    case "url":
      try {
        new URL(value);
      } catch {
        return `${chalk.red("✖")} ${chalk.bold(key)} — expected valid ${chalk.cyan(
          "URL"
        )}, got ${chalk.red(`"${value}"`)}`;
      }
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return `${chalk.red("✖")} ${chalk.bold(key)} — expected valid ${chalk.cyan(
          "email"
        )}, got ${chalk.red(`"${value}"`)}`;
      }
      break;
  }
  return null;
}

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