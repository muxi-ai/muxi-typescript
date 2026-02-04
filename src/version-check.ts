import { version } from "./version.js";

const SDK_NAME = "typescript";
const CACHE_KEY = "muxi_sdk_versions";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

interface VersionEntry {
  current: string;
  latest: string;
  last_notified: string;
}

interface VersionCache {
  [sdkName: string]: VersionEntry;
}

let hasCheckedVersion = false;

function notificationsDisabled(): boolean {
  if (typeof process !== "undefined") {
    return process.env.MUXI_SDK_VERSION_NOTIFICATION === "0";
  }
  return false;
}

function loadCache(): VersionCache {
  try {
    // Browser
    if (typeof localStorage !== "undefined") {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    }
    // Node.js
    const fs = require("fs");
    const path = require("path");
    const cacheFile = path.join(require("os").homedir(), ".muxi", "sdk-versions.json");
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
  } catch {}
  return {};
}

function saveCache(cache: VersionCache): void {
  try {
    // Browser
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return;
    }
    // Node.js
    const fs = require("fs");
    const path = require("path");
    const cacheDir = path.join(require("os").homedir(), ".muxi");
    const cacheFile = path.join(cacheDir, "sdk-versions.json");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  } catch {}
}

function wasNotifiedRecently(): boolean {
  try {
    const cache = loadCache();
    const entry = cache[SDK_NAME];
    if (!entry?.last_notified) return false;

    const lastNotified = new Date(entry.last_notified).getTime();
    const twelveHoursAgo = Date.now() - TWELVE_HOURS_MS;
    return lastNotified > twelveHoursAgo;
  } catch {}
  return false;
}

function updateLatestVersion(latest: string): void {
  try {
    const cache = loadCache();
    const entry = cache[SDK_NAME] || {};
    cache[SDK_NAME] = {
      ...entry,
      current: version,
      latest: latest,
    } as VersionEntry;
    saveCache(cache);
  } catch {}
}

function markNotified(): void {
  try {
    const cache = loadCache();
    if (cache[SDK_NAME]) {
      cache[SDK_NAME].last_notified = new Date().toISOString();
      saveCache(cache);
    }
  } catch {}
}

function isNewerVersion(latest: string, current: string): boolean {
  return latest.localeCompare(current, undefined, { numeric: true }) > 0;
}

export function checkForUpdates(responseHeaders: Headers): void {
  // Only check once per process/session
  if (hasCheckedVersion) return;
  hasCheckedVersion = true;

  // Dev mode only
  if (notificationsDisabled()) return;

  // Check header (may not exist on old servers)
  const latest = responseHeaders.get("X-Muxi-SDK-Latest");
  if (!latest) return;

  // Only proceed if server version is newer
  if (!isNewerVersion(latest, version)) return;

  // Always update cache with latest known version
  updateLatestVersion(latest);

  // Notify if 12 hours passed
  if (!wasNotifiedRecently()) {
    console.warn(`[muxi] SDK update available: ${latest} (current: ${version})`);
    console.warn(`[muxi] Run: npm update @muxi-ai/muxi`);
    markNotified();
  }
}
