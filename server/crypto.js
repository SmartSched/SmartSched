import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption of the user's own words and personal data before it reaches Supabase, so the dashboard (and
// anyone with database access) sees "enc:v1:..." instead of task titles, reflections or calendar links.
//
// AES-256-GCM with ENCRYPTION_KEY (32 random bytes, base64) from the server's environment. Each value is
// JSON-encoded first, so text and JSON columns are handled the same way; a JSON column then holds a JSON
// string. Nulls stay null. Lose the key and the data can't be read again, so keep a copy somewhere safe.
//
// Generate a key with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// The columns that are encrypted. Everything else (ids, dates, times, types, priorities, flags) stays
// readable so the database can still filter and sort on it.
export const ENCRYPTED_COLUMNS = {
  profiles: ["name", "survey", "travel", "scheduler_preferences", "avatar"],
  tasks: ["title", "description"],
  time_blocks: ["activity", "location"],
  time_block_series: ["activity", "location"],
  habits: ["name"],
  reflections: ["ratings"],
  schedule_events: ["details"],
  user_learning_events: ["data"],
  calendar_feeds: ["url"],
};

// The key, or null when ENCRYPTION_KEY isn't set (the tests). index.js refuses to start without one.
export function encryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export const isEncrypted = (value) =>
  typeof value === "string" && value.startsWith(PREFIX);

export function encryptValue(value, key = encryptionKey()) {
  if (value === null || value === undefined || isEncrypted(value)) return value;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")
  );
}

export function decryptValue(value, key = encryptionKey()) {
  if (!isEncrypted(value)) return value;
  if (!key)
    throw new Error("Found encrypted data but ENCRYPTION_KEY is not set");
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    raw.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const text = Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(text);
}

// A copy of a row (or rows) about to be written to `table`, with its encrypted columns encrypted.
export function encryptRows(table, rows, key = encryptionKey()) {
  const columns = ENCRYPTED_COLUMNS[table];
  if (!columns || !key || !rows || typeof rows !== "object") return rows;
  const one = (row) => {
    const copy = { ...row };
    for (const column of columns) {
      if (column in copy) copy[column] = encryptValue(copy[column], key);
    }
    return copy;
  };
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}

// Decrypts every encrypted string anywhere in a query result, including embedded rows (a block's task).
export function decryptDeep(value, key = encryptionKey()) {
  if (isEncrypted(value)) return decryptValue(value, key);
  if (Array.isArray(value)) return value.map((v) => decryptDeep(v, key));
  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decryptDeep(v, key);
    return out;
  }
  return value;
}

const WRITES = new Set(["insert", "update", "upsert"]);

// Wraps a query builder so writes encrypt their rows and awaiting it decrypts the result. Every builder a
// method returns is wrapped again, so the whole .from(...).select(...).eq(...) chain is covered.
function wrapBuilder(builder, table, key) {
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve, reject) =>
          target
            .then((result) =>
              result && result.data != null
                ? { ...result, data: decryptDeep(result.data, key) }
                : result,
            )
            .then(resolve, reject);
      }
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args) => {
        if (WRITES.has(prop)) args[0] = encryptRows(table, args[0], key);
        const out = value.apply(target, args);
        return out && typeof out === "object"
          ? wrapBuilder(out, table, key)
          : out;
      };
    },
  });
}

// A Supabase client whose .from(table) encrypts on the way in and decrypts on the way out. Without a key
// it's the client unchanged.
export function withEncryption(client, key = encryptionKey()) {
  if (!key) return client;
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "from") return value;
      return (table) => wrapBuilder(value.call(target, table), table, key);
    },
  });
}
