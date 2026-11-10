import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../lib/auth.js";

/**
 * Prints an scrypt hash for ADMIN_PASSWORD_HASH.
 * Usage: npm run hash-password
 *    or: npm run hash-password -- "mi contraseña"
 */

let password = process.argv[2];

if (!password) {
  const rl = createInterface({ input: stdin, output: stdout });
  password = await rl.question("Contraseña nueva: ");
  rl.close();
}

if (!password || password.length < 12) {
  console.error("Usá al menos 12 caracteres.");
  process.exit(1);
}

console.log(hashPassword(password));
