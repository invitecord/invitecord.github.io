// uptinter.js — InviteCord Update Integrator
// Fetches updates from your static site (invitecord.github.io) and processes them.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// -------------------- CONFIGURATION --------------------
const CONFIG = {
  // Your updates JSON file on GitHub Pages
  apiUrl: 'https://invitecord.github.io/updates.json',

  // Optional: if you use GitHub Releases instead, set this URL:
  // apiUrl: 'https://api.github.com/repos/invitecord/invitecord.github.io/releases',

  // If you need a GitHub token (for private repos or higher rate limits)
  // apiKey: process.env.GITHUB_TOKEN,

  // Where to store the last processed update ID
  lastIdFile: './last_update_id.txt',

  // Discord webhook URL (leave empty to only log)
  discordWebhook: process.env.DISCORD_WEBHOOK || '',

  // Request settings
  userAgent: 'InviteCord-Updater/1.0',
  timeout: 10000, // ms
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- UTILS --------------------
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const err = (msg) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/json',
        ...(CONFIG.apiKey && { 'Authorization': `Bearer ${CONFIG.apiKey}` }),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readLastId(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content || null;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeLastId(filePath, id) {
  fs.writeFileSync(filePath, String(id), 'utf8');
}

async function sendDiscordWebhook(webhookUrl, update) {
  const embed = {
    title: update.title || 'InviteCord Update',
    description: update.description || update.content || '',
    url: update.url || 'https://invitecord.github.io',
    color: 0x5865F2,
    timestamp: update.date || new Date().toISOString(),
    footer: { text: 'InviteCord Update Integrator' },
  };

  const payload = { embeds: [embed] };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook failed: ${res.status} ${text}`);
  }
  log('Discord notification sent.');
}

// -------------------- MAIN --------------------
async function checkForUpdates() {
  log('Checking InviteCord updates...');
  log(`Fetching: ${CONFIG.apiUrl}`);

  let updates;
  try {
    updates = await fetchJSON(CONFIG.apiUrl);
  } catch (e) {
    err(`Failed to fetch updates: ${e.message}`);
    return;
  }

  // Handle both raw arrays and GitHub Releases format
  let updateList = Array.isArray(updates) ? updates : updates?.updates;
  if (!updateList || updateList.length === 0) {
    log('No updates found.');
    return;
  }

  // Sort by id (if available), otherwise by date
  const sorted = updateList
    .filter((u) => u.id != null)
    .sort((a, b) => (a.id > b.id ? 1 : -1));

  if (sorted.length === 0) {
    log('Updates found but no "id" field. Cannot track.');
    // You could fall back to timestamp here if needed
    return;
  }

  const lastIdPath = path.resolve(__dirname, CONFIG.lastIdFile);
  const lastKnownId = readLastId(lastIdPath);
  const newUpdates = lastKnownId
    ? sorted.filter((u) => String(u.id) > String(lastKnownId))
    : sorted; // first run: all updates

  if (newUpdates.length === 0) {
    log('No new updates since last check.');
    return;
  }

  log(`Found ${newUpdates.length} new update(s):`);
  for (const update of newUpdates) {
    log(`  [${update.id}] ${update.title || 'Untitled'}`);

    // Send Discord webhook if configured
    if (CONFIG.discordWebhook) {
      try {
        await sendDiscordWebhook(CONFIG.discordWebhook, update);
      } catch (e) {
        err(`Discord notification failed for #${update.id}: ${e.message}`);
      }
    }
  }

  // Save the newest ID
  const latestId = sorted[sorted.length - 1].id;
  writeLastId(lastIdPath, latestId);
  log(`Last seen ID updated to ${latestId}.`);
}

// -------------------- EXECUTE --------------------
checkForUpdates()
  .then(() => process.exit(0))
  .catch((e) => {
    err(`Fatal: ${e.message}`);
    process.exit(1);
  });

// ---------------- Update Service, for code coping please contact us at uxidone@gmail.com or https://invitecord.github.io/app/contactus
