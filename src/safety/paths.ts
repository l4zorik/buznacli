import path from "node:path";
import { SafetyError } from "../errors.js";

export const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)\.git\//,
  /(^|\/)\.ssh\//,
  /(^|\/)\.aws\//,
  /(^|\/)\.gnupg\//,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /\.(pem|p12|pfx|key|keystore|jks)$/,
  /(^|\/)(credentials|secrets?)(\.[a-z0-9]+)?$/i,
  /(^|\/)\.netrc$/,
  /(^|\/)npmrc$/,
  /(^|\/)\.npmrc$/,
];

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function relativeToRoot(root: string, absolute: string): string {
  return toPosix(path.relative(root, absolute));
}

export function isSensitiveRelative(relPosix: string): boolean {
  const normalized = relPosix.replace(/^\.\//, "");
  if (normalized === "" || normalized === ".") {
    return false;
  }
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isSensitivePath(root: string, absolutePath: string): boolean {
  return isSensitiveRelative(relativeToRoot(root, absolutePath));
}

export function resolveWithinRoot(root: string, inputPath: string): string {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new SafetyError("Path must be a non-empty string");
  }
  if (inputPath.includes("\0")) {
    throw new SafetyError("Path contains NUL byte");
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, inputPath);

  const rel = path.relative(resolvedRoot, resolved);
  const escapes = rel.startsWith("..") || path.isAbsolute(rel);
  if (escapes) {
    throw new SafetyError(
      `Path escapes workspace root: ${inputPath} resolves to ${resolved}`,
    );
  }

  return resolved;
}

export function assertReadablePath(root: string, inputPath: string): string {
  const absolute = resolveWithinRoot(root, inputPath);
  if (isSensitivePath(root, absolute)) {
    throw new SafetyError(`Reading sensitive path is blocked: ${inputPath}`);
  }
  return absolute;
}

export function assertWritablePath(root: string, inputPath: string): string {
  const absolute = resolveWithinRoot(root, inputPath);
  if (isSensitivePath(root, absolute)) {
    throw new SafetyError(`Writing sensitive path is blocked: ${inputPath}`);
  }
  return absolute;
}
