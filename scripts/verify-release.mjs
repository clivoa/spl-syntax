import { existsSync, readFileSync, statSync } from "node:fs";

const parseJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const manifest = parseJson("manifest.json");
const packageJson = parseJson("package.json");
const versions = parseJson("versions.json");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? manifest.version;

if (tag !== manifest.version) {
  throw new Error(`Tag ${tag} does not match manifest version ${manifest.version}`);
}

if (packageJson.version !== manifest.version) {
  throw new Error(
    `Package version ${packageJson.version} does not match manifest version ${manifest.version}`,
  );
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(
    `versions.json value ${versions[manifest.version]} for ${manifest.version} does not match minAppVersion ${manifest.minAppVersion}`,
  );
}

for (const path of ["main.js", "manifest.json", "styles.css"]) {
  if (!existsSync(path)) {
    throw new Error(`Missing release asset: ${path}`);
  }
  if (statSync(path).size === 0) {
    throw new Error(`Release asset is empty: ${path}`);
  }
}

console.log(`Release contract valid for ${manifest.version}`);
