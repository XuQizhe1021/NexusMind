import { decryptApiKey, encryptApiKey } from "@nexusmind/core";
import { describe, expect, it } from "vitest";

describe("core crypto", () => {
  it("should decrypt to original api key", async () => {
    const payload = await encryptApiKey("sk-demo-key", "runtime-id");
    const plain = await decryptApiKey(
      payload.encryptedApiKey,
      payload.iv,
      payload.salt,
      "runtime-id"
    );
    expect(plain).toBe("sk-demo-key");
  });
});
