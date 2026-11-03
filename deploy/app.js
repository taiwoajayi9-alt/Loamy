/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS startup file run directly by Passenger */
/**
 * Startup file for Namecheap's "Setup Node.js App" (Phusion Passenger on CloudLinux).
 * cPanel → Setup Node.js App → Application startup file: app.js
 *
 * The built app lives in ./app (Next.js standalone bundle with its own node_modules),
 * because CloudLinux reserves ./node_modules in the application root for its own use.
 * Secrets live in ./.env on the server (sent by scripts/push-env.sh), never in Git.
 */
const path = require("node:path");
const fs = require("node:fs");

const root = __dirname;
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NODE_ENV = "production";

process.chdir(path.join(root, "app"));
require(path.join(root, "app", "server.js"));
