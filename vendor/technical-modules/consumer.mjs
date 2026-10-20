import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function contained(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || path.isAbsolute(relative)) throw Error('Invalid module path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Module path escapes its root');
  return target;
}
export function verifyModules(projectRoot) {
  const root = path.join(projectRoot, 'vendor/technical-modules');
  const pinPath = path.join(root, 'pin.json');
  if (!existsSync(pinPath)) throw Error('Pinned technical modules are missing');
  const pin = JSON.parse(readFileSync(pinPath));
  if (pin.schema !== 'technical-module-pin/1') throw Error('Unsupported module pin');
  for (const [name, expected] of Object.entries(pin.files)) {
    if (sha256(readFileSync(contained(root, name))) !== expected) throw Error('Pinned module changed: ' + name);
  }
  for (const [name, expected] of Object.entries(pin.hostFiles || {})) {
    if (sha256(readFileSync(contained(projectRoot, name))) !== expected) throw Error('Pinned worksheet changed: ' + name);
  }
  if (pin.releaseSha256 && sha256(readFileSync(path.join(root, 'release.json'))) !== pin.releaseSha256) throw Error('Module release pin changed');
  return pin;
}
