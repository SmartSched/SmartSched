// Encrypts the personal columns of rows saved before encryption was added (see crypto.js). Safe to run more
// than once: values that are already encrypted are left alone.
//
// Needs ENCRYPTION_KEY (the same one the server uses) and SUPABASE_SERVICE_ROLE_KEY in server/.env, since it
// reads every user's rows. From the server folder:
//   node scripts/encrypt-existing.js           shows how many values would be encrypted
//   node scripts/encrypt-existing.js --apply   encrypts them
import "dotenv/config";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import {
  ENCRYPTED_COLUMNS,
  encryptionKey,
  encryptValue,
  isEncrypted,
} from "../crypto.js";

const PAGE = 500;
const apply = process.argv.includes("--apply");

const key = encryptionKey();
if (!key) {
  console.error("ENCRYPTION_KEY is not set in server/.env");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in server/.env");
  process.exit(1);
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, realtime: { transport: ws } },
);

let total = 0;
for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
  let rowsChanged = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(["id", ...columns].join(", "))
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Could not read ${table}:`, error.message);
      process.exit(1);
    }
    for (const row of data) {
      const patch = {};
      for (const column of columns) {
        const value = row[column];
        if (value !== null && value !== undefined && !isEncrypted(value))
          patch[column] = encryptValue(value, key);
      }
      if (Object.keys(patch).length === 0) continue;
      rowsChanged++;
      if (!apply) continue;
      const { error: updateError } = await supabase
        .from(table)
        .update(patch)
        .eq("id", row.id);
      if (updateError) {
        console.error(`Could not update ${table} ${row.id}:`, updateError.message);
        process.exit(1);
      }
    }
    if (data.length < PAGE) break;
  }
  console.log(`${table}: ${rowsChanged} row(s) ${apply ? "encrypted" : "to encrypt"}`);
  total += rowsChanged;
}
console.log(
  apply
    ? `Done. ${total} row(s) encrypted.`
    : `${total} row(s) to encrypt. Run again with --apply to encrypt them.`,
);
