import argon2 from "argon2";
import { Buffer } from "node:buffer";
import process, { stdin, stdout } from "node:process";

function readHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    const characters = [];
    const restoreTerminal = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003" || character === "\u0004") {
          restoreTerminal();
          reject(new Error("Password entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          restoreTerminal();
          resolve(characters.join(""));
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          characters.pop();
          continue;
        }
        if (character >= " " && character !== "\u007f") characters.push(character);
      }
    };

    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    stdout.write(label);
  });
}

try {
  if (process.argv.length !== 2) throw new Error("This command does not accept password arguments.");

  const password = await readHidden("New administrator password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const byteLength = Buffer.byteLength(password, "utf8");
  if (Array.from(password).length < 16 || byteLength > 1024) {
    throw new Error("Use 16 or more characters and no more than 1024 UTF-8 bytes.");
  }

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    saltLength: 16,
  });
  stdout.write(`${hash}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Hash generation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
