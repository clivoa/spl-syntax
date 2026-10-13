import { loadPrism, Plugin } from "obsidian";

import {
  registerSPLEditorMode,
  unregisterSPLEditorMode,
  type CodeMirrorRegistry,
} from "./spl-cm-mode";
import { definePrismSPL, removePrismSPL, type PrismLike } from "./spl-prism";

const getCodeMirror = (): CodeMirrorRegistry | undefined =>
  (window as unknown as { CodeMirror?: CodeMirrorRegistry }).CodeMirror;

export default class SPLSyntaxPlugin extends Plugin {
  private prism: PrismLike | null = null;

  async onload(): Promise<void> {
    if (!registerSPLEditorMode(getCodeMirror())) {
      console.error("SPL Syntax: CodeMirror registry unavailable; editor highlighting disabled.");
    }
    try {
      const prism = (await loadPrism()) as PrismLike;
      definePrismSPL(prism);
      this.prism = prism;
    } catch (error) {
      console.error("SPL Syntax: failed to load Prism; reading-view highlighting disabled.", error);
    }
    this.app.workspace.onLayoutReady(() => this.rebuildMarkdownViews());
  }

  onunload(): void {
    unregisterSPLEditorMode(getCodeMirror());
    if (this.prism) {
      removePrismSPL(this.prism);
      this.prism = null;
    }
    this.rebuildMarkdownViews();
  }

  private rebuildMarkdownViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      (leaf as unknown as { rebuildView?: () => void }).rebuildView?.();
    }
  }
}
