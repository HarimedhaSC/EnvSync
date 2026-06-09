# envsync

> Sync environment variables securely across teams and machines.

A production-grade CLI tool built with Node.js, TypeScript, PostgreSQL, and AES-256-GCM encryption. Think Doppler, but built from scratch.

---

## Features

- 🔐 **AES-256-GCM encryption** — every variable encrypted at rest with a unique IV
- 🔄 **Push & pull** — sync your `.env` file to/from a central server
- 🩺 **Schema validation** — define types, required fields, and allowed values. Catch issues before runtime
- 🔍 **Diff** — see exactly what's out of sync between local and server
- 📜 **Audit history** — every change logged with who made it and when
- 👥 **RBAC** — invite teammates with admin, member, or viewer roles
- 🤖 **AI explain** — use Gemini AI to explain what any variable does and flag issues
- 🔑 **CI/CD tokens** — scoped API tokens for GitHub Actions pipelines

---

## Tech Stack

- **CLI** — Node.js + TypeScript + Commander.js
- **API** — Express + TypeScript
- **Database** — PostgreSQL + Redis
- **Encryption** — AES-256-GCM (per-variable IV)
- **Auth** — JWT + bcrypt
- **AI** — Google Gemini API

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL + Redis)
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/HarimedhaSC/EnvSync.git
cd EnvSync

# Install dependencies
npm install

# Start PostgreSQL + Redis
docker compose up -d

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste into packages/api/.env → ENCRYPTION_KEY=

# Run database migrations
cd packages/api && npm run migrate

# Start the API server
npm run dev
```

### Build & link the CLI

```bash
cd packages/cli
npm run build
npm link
```

### Start using it

```bash
# Register an account
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword","name":"Your Name"}'

# Log in
envsync login

# Link a project
envsync init

# Push your .env to the server
envsync push

# Pull variables from the server
envsync pull
```

---

## CLI Commands

### Core

| Command | Description |
|---|---|
| `envsync login` | Authenticate with email and password |
| `envsync logout` | Clear stored credentials |
| `envsync init` | Link current directory to a project |
| `envsync push` | Upload local `.env` to server (encrypted) |
| `envsync pull` | Fetch variables from server and write to `.env` |
| `envsync list` | List all variables (secrets hidden by default) |
| `envsync list --reveal` | Show actual values |

### Schema & Validation

| Command | Description |
|---|---|
| `envsync schema init` | Generate `.envsync.schema.json` from your `.env` |
| `envsync schema show` | Print the current schema |
| `envsync doctor` | Validate `.env` against schema — catch missing/invalid variables |

### Diff & History

| Command | Description |
|---|---|
| `envsync diff` | Compare local `.env` against server |
| `envsync history` | Show full audit trail of changes |
| `envsync history <KEY>` | Filter history for a specific variable |

### Team Management

| Command | Description |
|---|---|
| `envsync members list` | List all project members |
| `envsync members invite <email>` | Invite a teammate by email |
| `envsync members remove <email>` | Remove a member |
| `envsync members role <email> <role>` | Change a member's role |

### CI/CD Tokens

| Command | Description |
|---|---|
| `envsync tokens list` | List all API tokens |
| `envsync tokens create <name>` | Create a scoped CI/CD token |
| `envsync tokens revoke <name>` | Revoke a token |

### AI

| Command | Description |
|---|---|
| `envsync explain <KEY>` | Use Gemini AI to explain a variable and flag issues |

---

## Schema Validation

Create a schema to define rules for your variables:

```json
{
  "version": 1,
  "variables": {
    "PORT": {
      "required": true,
      "type": "number",
      "description": "Port the server listens on",
      "example": "3000"
    },
    "NODE_ENV": {
      "required": true,
      "type": "string",
      "allowed": ["development", "staging", "production"],
      "description": "Runtime environment"
    },
    "DATABASE_URL": {
      "required": true,
      "type": "url"
    }
  }
}
```

Run `envsync doctor` to validate:

```
✓ PORT
✓ NODE_ENV
✖ DATABASE_URL — expected valid URL, got "localhost:5432"

❌ Found 1 error
```

---

## CI/CD with GitHub Actions

```bash
# Create a token for your pipeline
envsync tokens create "GitHub Actions"
# Add the token to GitHub repo secrets as ENVSYNC_TOKEN
```

See `.github/workflows/envsync.yml` for the full workflow template.

---

## Database Schema

7 tables:

| Table | Purpose |
|---|---|
| `users` | Email, password hash, name |
| `projects` | Project name and slug |
| `project_members` | RBAC — admin / member / viewer roles |
| `environments` | dev / staging / prod per project |
| `variables` | AES-256-GCM encrypted values |
| `variable_history` | Append-only audit trail |
| `api_tokens` | CI/CD tokens (bcrypt hashed) |

---

## Security

- Variables encrypted with **AES-256-GCM** — authenticated encryption that detects tampering
- Unique IV per variable — identical values produce different ciphertexts
- Passwords hashed with **bcrypt**
- API tokens hashed with **bcrypt**, raw token shown only once
- JWT authentication with configurable expiry
- Audit trail survives variable deletion (no foreign key constraint)

---

## Project Structure

```
envsync/
├── packages/
│   ├── api/          — Express REST API
│   │   └── src/
│   │       ├── db/           (schema, migrations, pool)
│   │       ├── middleware/   (JWT auth, RBAC guards)
│   │       ├── routes/       (auth, projects, variables, history, members, tokens)
│   │       └── services/     (AES-256-GCM encryption)
│   ├── cli/          — Commander.js CLI
│   │   └── src/
│   │       ├── commands/     (all CLI commands)
│   │       └── utils/        (API client, config)
│   └── shared/       — Shared TypeScript types
└── docker-compose.yml
```

---

## Environment Variables

```dotenv
# packages/api/.env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://envsync:envsync_secret@localhost:5432/envsync_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_strong_random_secret
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=your_32_byte_hex_key
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

