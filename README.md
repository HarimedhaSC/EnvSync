# envsync

Sync environment variables securely across teams and machines.

## Quickstart

### 1. Start infrastructure

```bash
docker compose up -d
```

### 2. Install API dependencies and run migrations

```bash
cd packages/api
npm install
npm run migrate
npm run dev
```

### 3. Build and link the CLI (in a new terminal)

```bash
cd packages/cli
npm install
npm run build
npm link          # makes `envsync` available globally
```

### 4. Use it

```bash
# Log in
envsync login

# Initialize in your project directory
cd /your/project
envsync init

# Push your existing .env
envsync push

# Pull on another machine
envsync pull
```

## CLI Commands

| Command | Description |
|---|---|
| `envsync login` | Authenticate with your account |
| `envsync init` | Link current directory to a project |
| `envsync push` | Upload local `.env` to envsync |
| `envsync pull` | Download variables to `.env` |
| `envsync list` | List variables (values hidden) |
| `envsync list --reveal` | List with decrypted values |
| `envsync logout` | Clear stored credentials |

## Options

```bash
envsync pull --env production --output .env.prod
envsync push --env staging --file .env.staging
envsync list --env production
```

## Architecture

```
packages/
  api/     Express + TypeScript backend
  cli/     Commander.js CLI tool
  shared/  Shared types (coming soon)

Infrastructure:
  PostgreSQL  variable storage (AES-256-GCM encrypted values)
  Redis       session caching (coming soon)
```

## Security

- All variable values encrypted at rest with AES-256-GCM
- Per-key IV — no two encryptions produce the same ciphertext
- Full audit trail: every create/update/delete is logged
- JWT auth for users, long-lived API tokens for CI/CD
