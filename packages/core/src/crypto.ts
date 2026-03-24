const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SALT_BYTES = 16;
const IV_BYTES = 12;
const ITERATIONS = 120000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKey(runtimeId: string, salt: Uint8Array): Promise<CryptoKey> {
  // 这里使用 runtimeId 作为可重复输入，确保同一浏览器实例可稳定解密已保存密文。
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(runtimeId),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export interface EncryptedPayload {
  encryptedApiKey: string;
  iv: string;
  salt: string;
}

export async function encryptApiKey(apiKey: string, runtimeId: string): Promise<EncryptedPayload> {
  // 每次加密都生成新 salt/iv，避免相同明文产生相同密文，降低重放分析风险。
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(runtimeId, salt);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv)
    },
    key,
    encoder.encode(apiKey)
  );

  return {
    encryptedApiKey: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    salt: toBase64(salt)
  };
}

export async function decryptApiKey(
  encryptedApiKey: string,
  iv: string,
  salt: string,
  runtimeId: string
): Promise<string> {
  // 解密参数严格来自已存储密文元数据，避免跨记录混用导致错误或数据污染。
  const key = await deriveKey(runtimeId, fromBase64(salt));
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(fromBase64(iv))
    },
    key,
    toArrayBuffer(fromBase64(encryptedApiKey))
  );
  return decoder.decode(plain);
}
