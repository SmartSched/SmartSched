import { afterEach, describe, expect, it } from "vitest";
import {
  decryptDeep,
  decryptValue,
  encryptRows,
  encryptValue,
  encryptionKey,
  isEncrypted,
  withEncryption,
} from "../crypto.js";

const KEY = Buffer.alloc(32, 1);
const OTHER_KEY = Buffer.alloc(32, 2);

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encryptValue / decryptValue", () => {
  it("round-trips text and JSON", () => {
    for (const value of ["Essay draft", "", { focus: [1, 2], note: "é ✓" }, [1, "a"], 3, true]) {
      const sealed = encryptValue(value, KEY);
      expect(isEncrypted(sealed)).toBe(true);
      expect(sealed).not.toContain("Essay");
      expect(decryptValue(sealed, KEY)).toEqual(value);
    }
  });

  it("gives a different result each time for the same value", () => {
    expect(encryptValue("same", KEY)).not.toBe(encryptValue("same", KEY));
  });

  it("leaves null and already encrypted values alone", () => {
    expect(encryptValue(null, KEY)).toBeNull();
    const sealed = encryptValue("x", KEY);
    expect(encryptValue(sealed, KEY)).toBe(sealed);
  });

  it("refuses a different key or a changed value", () => {
    const sealed = encryptValue("secret", KEY);
    expect(() => decryptValue(sealed, OTHER_KEY)).toThrow();
    const raw = Buffer.from(sealed.slice(7), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptValue(`enc:v1:${raw.toString("base64")}`, KEY)).toThrow();
  });

  it("passes readable values through, so rows saved before encryption still load", () => {
    expect(decryptValue("plain title", KEY)).toBe("plain title");
  });
});

describe("encryptionKey", () => {
  it("is null without ENCRYPTION_KEY and refuses a key of the wrong size", () => {
    expect(encryptionKey()).toBeNull();
    process.env.ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptionKey()).toThrow(/32 bytes/);
  });
});

describe("encryptRows", () => {
  it("encrypts only the table's personal columns, without changing the original", () => {
    const row = { title: "Essay", type: "homework", description: null };
    const [out] = encryptRows("tasks", [row], KEY);
    expect(isEncrypted(out.title)).toBe(true);
    expect(out.type).toBe("homework");
    expect(out.description).toBeNull();
    expect(row.title).toBe("Essay");
  });

  it("leaves tables with nothing to encrypt alone", () => {
    const row = { provider: "google" };
    expect(encryptRows("unknown_table", row, KEY)).toBe(row);
  });
});

describe("decryptDeep", () => {
  it("decrypts nested rows and leaves the rest", () => {
    const data = [
      { id: 1, activity: encryptValue("Gym", KEY), task: { title: encryptValue("Read", KEY) }, date: "2026-11-11" },
    ];
    expect(decryptDeep(data, KEY)).toEqual([
      { id: 1, activity: "Gym", task: { title: "Read" }, date: "2026-11-11" },
    ]);
  });
});

describe("withEncryption", () => {
  // A minimal stand-in for a Supabase query builder: chainable, and awaiting it answers `result`.
  function fakeClient(result) {
    const calls = [];
    const builder = {
      insert(rows) {
        calls.push(["insert", rows]);
        return this;
      },
      select() {
        calls.push(["select"]);
        return this;
      },
      eq() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return { calls, client: { from: () => builder, auth: "auth" } };
  }

  it("encrypts writes and decrypts what comes back", async () => {
    const stored = { title: encryptValue("Essay", KEY), type: "exam" };
    const { calls, client } = fakeClient({ data: [stored], error: null });
    const { data } = await withEncryption(client, KEY)
      .from("tasks")
      .insert({ title: "Essay", type: "exam" })
      .select()
      .eq("id", 1);
    expect(data).toEqual([{ title: "Essay", type: "exam" }]);
    expect(isEncrypted(calls[0][1].title)).toBe(true);
  });

  it("is the same client when there's no key", () => {
    const { client } = fakeClient({ data: null });
    expect(withEncryption(client, null)).toBe(client);
    expect(withEncryption(client, KEY).auth).toBe("auth");
  });
});
