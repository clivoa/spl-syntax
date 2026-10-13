import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", path), "utf8");
const json = <T>(path: string): T => JSON.parse(read(path)) as T;

describe("community metadata", () => {
  it("keeps package, manifest, and versions metadata aligned", () => {
    const pkg = json<{ name: string; version: string }>("package.json");
    const manifest = json<{
      id: string;
      name: string;
      version: string;
      minAppVersion: string;
      isDesktopOnly: boolean;
    }>("manifest.json");
    const versions = json<Record<string, string>>("versions.json");
    expect(manifest).toMatchObject({
      id: "spl-syntax",
      name: "SPL Syntax",
      version: "0.1.0",
      minAppVersion: "1.0.0",
      isDesktopOnly: false,
    });
    expect(pkg.name).toBe(manifest.id);
    expect(pkg.version).toBe(manifest.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it("ships a styles.css that defines no colors", () => {
    const styles = read("styles.css");
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styles).not.toContain("color:");
  });

  it("documents the spl fence, privacy, manual install, and real templates", () => {
    const readme = read("README.md");
    for (const expected of [
      "```spl",
      "```splunk",
      "main.js",
      "manifest.json",
      "styles.css",
      "no telemetry",
      "templates/",
    ]) {
      expect(readme).toContain(expected);
    }
    for (const template of ["getting-started.spl", "reporting.spl", "threat-hunting.spl"]) {
      const source = read(`templates/${template}`);
      expect(source).toContain("index=");
      expect(source).toContain("|");
    }
    const hunting = read("templates/threat-hunting.spl");
    expect(hunting).toContain("```");
    expect(hunting).toContain("`");
    expect(hunting).toContain("tstats");
    expect(hunting).toContain("earliest=-7d@d");
    expect(hunting).toMatch(/\[\s*search/);
    expect(read("templates/reporting.spl")).toContain("timechart");
  });

  it("passes CI the manifest version instead of the ambient GitHub ref", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain(
      `npm run verify:release -- "$(node -p "require('./manifest.json').version")"`,
    );
    expect(workflow).not.toMatch(/- run: npm run verify:release\s*$/m);
  });

  it("attests build provenance for every release asset", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("uses: actions/attest@v4");
    for (const asset of ["main.js", "manifest.json", "styles.css"]) {
      expect(workflow).toContain(asset);
    }
    expect(workflow.indexOf("actions/attest@v4")).toBeLessThan(
      workflow.indexOf("Create or update GitHub release"),
    );
  });

  it("removes unexpected assets before updating an existing release", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("main.js|manifest.json|styles.css) ;;");
    expect(workflow).toContain(`gh release delete-asset "$GITHUB_REF_NAME" "$asset" --yes`);
    expect(workflow.indexOf("gh release delete-asset")).toBeLessThan(
      workflow.indexOf("gh release upload"),
    );
  });

  it("accepts the exact manifest version and rejects a v-prefixed tag", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/verify-release.mjs", "0.1.0"], { stdio: "pipe" }),
    ).not.toThrow();
    expect(() =>
      execFileSync(process.execPath, ["scripts/verify-release.mjs", "v0.1.0"], { stdio: "pipe" }),
    ).toThrow();
  });
});
