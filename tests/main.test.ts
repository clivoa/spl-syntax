import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Imported by path, not as "obsidian": the mock's test-only seams are not part
// of the real obsidian types, and `npm run typecheck` covers this file.
// vitest's alias resolves "obsidian" to this same file, so the module instance
// and its Prism singleton are shared with src/main.ts.
import { loadPrism, resetPrismLoader, setPrismLoader } from "./mocks/obsidian";
import SPLSyntaxPlugin from "../src/main";
import { SPL_MODE_MIME, SPL_MODE_NAME, type CodeMirrorRegistry } from "../src/spl-cm-mode";
import { SPL_PRISM_LANGUAGES } from "../src/spl-prism";

const makeRegistry = (): CodeMirrorRegistry => ({
  defineMode: vi.fn(),
  defineMIME: vi.fn(),
  modes: {},
  mimeModes: {},
  modeInfo: [],
});

const rebuildView = vi.fn();

// The real obsidian Plugin constructor takes (app, manifest); the mock ignores
// both, but tsc typechecks this file against the real obsidian types, so the
// arguments have to be there. The mock's Plugin does not assign this.app, hence
// the explicit assignment afterwards.
const makePlugin = (): SPLSyntaxPlugin => {
  const app = {
    workspace: {
      onLayoutReady: (callback: () => void) => callback(),
      getLeavesOfType: () => [{ rebuildView }],
    },
  };
  const plugin = new SPLSyntaxPlugin(app as never, { id: "spl-syntax" } as never);
  (plugin as unknown as { app: unknown }).app = app;
  return plugin;
};

describe("SPLSyntaxPlugin", () => {
  beforeEach(() => {
    (window as unknown as { CodeMirror?: CodeMirrorRegistry }).CodeMirror = makeRegistry();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    resetPrismLoader();
    const prism = await loadPrism();
    for (const language of SPL_PRISM_LANGUAGES) delete prism.languages[language];
    delete (window as unknown as { CodeMirror?: CodeMirrorRegistry }).CodeMirror;
  });

  it("registers both engines on load and rebuilds markdown views once", async () => {
    const plugin = makePlugin();
    await plugin.onload();
    const cm = (window as unknown as { CodeMirror: CodeMirrorRegistry }).CodeMirror;
    expect(cm.defineMode).toHaveBeenCalledWith(SPL_MODE_NAME, expect.any(Function));
    expect(cm.defineMIME).toHaveBeenCalledWith(SPL_MODE_MIME, SPL_MODE_NAME);
    const prism = await loadPrism();
    for (const language of SPL_PRISM_LANGUAGES) {
      expect(prism.languages[language]).toBeDefined();
    }
    expect(rebuildView).toHaveBeenCalled();
  });

  it("keeps Prism working and logs when CodeMirror is unavailable", async () => {
    delete (window as unknown as { CodeMirror?: CodeMirrorRegistry }).CodeMirror;
    const plugin = makePlugin();
    await expect(plugin.onload()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    const prism = await loadPrism();
    expect(prism.languages[SPL_PRISM_LANGUAGES[0]]).toBeDefined();
  });

  it("keeps the editor mode working and logs when Prism fails to load", async () => {
    setPrismLoader(async () => {
      throw new Error("no prism");
    });
    const plugin = makePlugin();
    await expect(plugin.onload()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    const cm = (window as unknown as { CodeMirror: CodeMirrorRegistry }).CodeMirror;
    expect(cm.defineMode).toHaveBeenCalled();
  });

  it("unregisters both engines and rebuilds views on unload", async () => {
    const plugin = makePlugin();
    await plugin.onload();
    rebuildView.mockClear();
    plugin.onunload();
    const cm = (window as unknown as { CodeMirror: CodeMirrorRegistry }).CodeMirror;
    expect(cm.modeInfo).toEqual([]);
    const prism = await loadPrism();
    for (const language of SPL_PRISM_LANGUAGES) {
      expect(prism.languages[language]).toBeUndefined();
    }
    expect(rebuildView).toHaveBeenCalled();
  });
});
