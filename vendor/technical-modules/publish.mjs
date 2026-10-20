import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { contained, sha256, verifyModules } from './consumer.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const ignore = new Set(['tests', 'validation', 'node_modules', '.git']);
export function buildRelease(sourceRoot = root) {
  const files = {}, modules = {};
  function scan(directory) {
    for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if (entry.isSymbolicLink()) throw Error('A module distribution cannot contain symlinks');
      const p = path.join(directory,entry.name), relative=path.relative(sourceRoot,p).split(path.sep).join('/');
      if (entry.isDirectory()) { if (!ignore.has(entry.name)) scan(p); continue; }
      if (directory === sourceRoot && ['release.json','pin.json'].includes(entry.name)) continue;
      files[relative]=sha256(readFileSync(p));
      if (entry.name === 'manifest.json') {
        const m=JSON.parse(readFileSync(p));
        if (m.schema === 'technical-module/1') {
          if (Object.hasOwn(modules,m.moduleId)) throw Error('Duplicate module ID');
          modules[m.moduleId]=m.version;
        }
      }
    }
  }
  scan(sourceRoot);
  const libraryVersion=JSON.parse(readFileSync(path.join(sourceRoot,'package.json'))).version;
  const release={schema:'technical-module-release/1',libraryVersion,modules,files};
  writeFileSync(path.join(sourceRoot,'release.json'),JSON.stringify(release,null,2)+'\n');
  return release;
}
export function publishModules(projectRoot, sourceRoot = root) {
  const releasePath=path.join(sourceRoot,'release.json'), release=JSON.parse(readFileSync(releasePath));
  const target=path.join(projectRoot,'vendor/technical-modules');
  for (const [name,expected] of Object.entries(release.files)) {
    if (sha256(readFileSync(contained(sourceRoot,name))) !== expected) throw Error('Module producer changed: '+name);
  }
  if (existsSync(path.join(target,'pin.json'))) {
    const previous=verifyModules(projectRoot);
    if (previous.releaseSha256 && previous.releaseSha256 !== sha256(readFileSync(releasePath))) {
      const a=release.libraryVersion.split('.').map(Number), b=previous.libraryVersion.split('.').map(Number);
      const position=a.findIndex((v,i)=>v!==b[i]);
      if (position<0 || a[position]<=b[position]) throw Error('Changed module content needs a newer library version');
    }
  }
  const hostFiles={};
  for (const name of Object.keys(release.files)) {
    const p=contained(target,name);mkdirSync(path.dirname(p),{recursive:true});copyFileSync(contained(sourceRoot,name),p);
    if (name.startsWith('automobile/worksheets/') && existsSync(path.join(projectRoot,'manuscript/calculations'))) {
      const relative='manuscript/calculations/'+path.basename(name), host=contained(projectRoot,relative);
      copyFileSync(contained(sourceRoot,name),host);hostFiles[relative]=release.files[name];
    }
    if (name.startsWith('ice-core/worksheets/') && existsSync(path.join(projectRoot,'powertrain/src'))) {
      const relative=name.slice('ice-core/worksheets/'.length),host=contained(projectRoot,relative);
      copyFileSync(contained(sourceRoot,name),host);hostFiles[relative]=release.files[name];
    }
  }
  copyFileSync(releasePath,path.join(target,'release.json'));
  const provenance={libraryVersion:release.libraryVersion,origin:'My_books/vehickle_math_models/modules',modules:release.modules,releaseSha256:sha256(readFileSync(releasePath))};
  const provenanceText='export const technicalModules='+JSON.stringify(provenance)+';\n';
  writeFileSync(path.join(target,'consumer-provenance.mjs'),provenanceText);
  const pin={schema:'technical-module-pin/1',libraryVersion:release.libraryVersion,origin:'My_books/vehickle_math_models/modules',
    modules:release.modules,files:{...release.files,'consumer-provenance.mjs':sha256(Buffer.from(provenanceText))},hostFiles,releaseSha256:provenance.releaseSha256};
  writeFileSync(path.join(target,'pin.json'),JSON.stringify(pin,null,2)+'\n');
  return verifyModules(projectRoot);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildRelease();
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--project=')) throw Error('Use --project=/absolute/project/path');
    publishModules(path.resolve(arg.slice(10)));
  }
}
