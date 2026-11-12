import "dotenv/config";
import { app } from "./app.js";
import { encryptionKey } from "./crypto.js";

const PORT = process.env.PORT || 3001;

// Without the key, new data would be saved readable and encrypted data couldn't be read back.
if (!encryptionKey()) {
  console.error(
    "ENCRYPTION_KEY is not set. Add it to server/.env (see server/crypto.js for how to make one).",
  );
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`SmartSched server listening on port ${PORT}`);
});
