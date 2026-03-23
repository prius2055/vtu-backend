require("dotenv").config();

/**
 * tokenEncryption.js
 * AES-256-CBC encryption/decryption for marketer API tokens.
 *
 * TOKEN_ENCRYPTION_KEY must be exactly 32 characters in .env
 * Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex').slice(0,32))"
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const KEY = process.env.TOKEN_ENCRYPTION_KEY;

console.log(KEY);

if (!KEY || KEY.length !== 32) {
  console.warn(
    "⚠️  TOKEN_ENCRYPTION_KEY must be exactly 32 characters. " +
      "API token encryption will not work correctly.",
  );
}

/**
 * Encrypt a plain-text token.
 * Returns "ivHex:encryptedHex" string safe to store in MongoDB.
 */
const encrypt = (text) => {
  if (!text) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), iv);

  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

/**
 * Decrypt a stored token back to plain text.
 * Expects "ivHex:encryptedHex" format produced by encrypt().
 */
const decrypt = (text) => {
  if (!text) return null;

  const [ivHex, encryptedHex] = text.split(":");
  if (!ivHex || !encryptedHex) return null;

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY), iv);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString();
};

module.exports = { encrypt, decrypt };
