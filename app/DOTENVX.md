# dotenvx Encrypted Env Pattern (Pilot)

## What
`@dotenvx/dotenvx` encrypts `.env` files with AES-256-GCM so secrets aren't in plaintext.
The encrypted file can be committed safely; decryption needs `DOTENV_PRIVATE_KEY`.

## Current State (Pilot)
- `.env.local` — plaintext, gitignored, works as before (unchanged)
- `.env.local.encrypted` — demonstration of encrypted format (pilot only)
- `.env.local.example` — template with placeholders (unchanged)

## How to Use (when ready to adopt fully)
```bash
# Encrypt in place (note: dotenvx has a FILE_NOT_WRITABLE bug in containers;
# use --stdout workaround):
npx dotenvx encrypt -f .env.local --stdout > .env.local

# Run with decryption:
npx dotenvx run -- npm run dev
# or: DOTENV_PRIVATE_KEY=<key> npx dotenvx run -- npm run build

# On Vercel/Render: set DOTENV_PRIVATE_KEY as an env var
```

## Key Management
- Private key: stored in `.env.keys` (gitignored) or OS keychain
- NEVER commit `.env.keys` or the private key
- Share private keys via secure channels (not chat, not repo)

## References
- https://dotenvx.com/encryption
- Installed: `@dotenvx/dotenvx` v2.34.2 (devDependency)
