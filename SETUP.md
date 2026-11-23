# Attuned Ledger

The shared Attuned Ledger runs at <https://xhublauncher.github.io/deepwoken-go-registry/>. It uses a Cloudflare Worker API and a Cloudflare D1 database, so registrations are shared across devices without room codes.

## What visitors can see

Visitors can see usernames, reviews, and registration dates. Coordinates are stored in D1 and are never returned by the public leaderboard API. The page asks for location only after someone clicks **Attune & Register**.

## Admin access

Admins use the diamond button on the page and sign in with the Cloudflare Worker secret named `ADMIN_PASSWORD`. Set or rotate that secret in the `deepwoken-ledger-api` Worker under **Settings → Variables and secrets**. Keep the password private and do not add it to this repository. Admin sessions last 12 hours in the current browser tab; admins can view coordinates and remove entries.

The Cloudflare account owner can also access the D1 database directly. The database is named `attuned-ledger`. Keep Cloudflare account access restricted to trusted people.

## Website files

`index.html`, `app.js`, and `config.js` power the GitHub Pages site. The Worker source and D1 migration are kept in the local `outputs/cloudflare-worker` folder. Its `wrangler.toml` contains the deployed database ID, but no admin password.
