import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSPLMode,
  registerSPLEditorMode,
  SPL_MODE_MIME,
  SPL_MODE_NAME,
  unregisterSPLEditorMode,
  type CodeMirrorModeInfoEntry,
  type CodeMirrorRegistry,
  type SPLStream,
} from "../src/spl-cm-mode";

const styles = (source: string): Array<[string, string | null]> => {
  const mode = createSPLMode();
  const state = mode.startState();
  const output: Array<[string, string | null]> = [];
  for (const line of source.split("\n")) {
    if (line.length === 0) {
      mode.blankLine(state);
      continue;
    }
    const stream: SPLStream = { string: line, pos: 0 };
    let guard = 0;
    while (stream.pos < line.length) {
      const start = stream.pos;
      const style = mode.token(stream, state);
      output.push([line.slice(start, stream.pos), style]);
      if (stream.pos <= start) throw new Error("token() failed to advance");
      if ((guard += 1) > 500) throw new Error("token() looped");
    }
  }
  return output;
};

const styleOf = (source: string, text: string): string | null | undefined =>
  styles(source).find((entry) => entry[0] === text)?.[1];

const makeRegistry = (modeInfo: CodeMirrorModeInfoEntry[] = []): CodeMirrorRegistry => ({
  defineMode: vi.fn(),
  defineMIME: vi.fn(),
  modes: {},
  mimeModes: {},
  modeInfo,
});

describe("SPL CodeMirror mode", () => {
  // registerSPLEditorMode keeps stashed shadow entries in module state; clear
  // it so test order cannot leak a stash from one case into the next.
  beforeEach(() => {
    unregisterSPLEditorMode(makeRegistry());
  });

  it("maps tokens onto classes Obsidian colors", () => {
    expect(styleOf("search index=main", "search")).toBe("keyword");
    expect(styleOf("| stats count BY user", "stats")).toBe("keyword");
    expect(styleOf("| stats count BY user", "BY")).toBe("keyword");
    expect(styleOf('| eval x=if(a,"y","n")', "if")).toBe("builtin");
    expect(styleOf("| search a AND b", "AND")).toBe("operator");
    expect(styleOf("`security_indexes`", "`security_indexes`")).toBe("variable-2");
    expect(styleOf("| table _time", "_time")).toBe("variable-2");
    expect(styleOf("| eval x='my field'", "'my field'")).toBe("string-2");
    expect(styleOf('search msg="boom"', '"boom"')).toBe("string");
    expect(styleOf("```note```", "```note```")).toBe("comment");
    expect(styleOf("| eval x=24", "24")).toBe("number");
    expect(styleOf("search earliest=-24h@h", "-24h@h")).toBe("number");
    expect(styleOf("| stats count", "|")).toBe("operator");
    expect(styleOf("| stats count(*)", "(")).toBe("bracket");
    expect(styleOf("search user=bob", "user")).toBe(null);
  });

  it("keeps a comment open across lines and closes it on the right line", () => {
    const output = styles("| stats count ```start\nmiddle\nend``` | sort x");
    expect(output).toContainEqual(["middle", "comment"]);
    expect(output).toContainEqual(["end```", "comment"]);
    expect(output.find((entry) => entry[0] === "sort")?.[1]).toBe("keyword");
  });

  it("leaves an open comment open across a blank line", () => {
    const output = styles("```start\n\nstill```");
    expect(output).toContainEqual(["still```", "comment"]);
  });

  it("does not continue an unterminated macro onto the next line", () => {
    const output = styles("`open\n| stats count");
    expect(output).toContainEqual(["`open", "variable-2"]);
    expect(output.find((entry) => entry[0] === "stats")?.[1]).toBe("keyword");
  });

  it("isolates copied state", () => {
    const mode = createSPLMode();
    const state = mode.startState();
    mode.token({ string: "```open", pos: 0 }, state);
    const copy = mode.copyState(state);
    expect(copy.continuation).toBe("```");
    copy.spans.push({ end: 999, style: "comment" });
    expect(state.spans).not.toHaveLength(copy.spans.length);
  });

  it("registers the mode, the MIME, and both modeInfo names", () => {
    const cm = makeRegistry();
    expect(registerSPLEditorMode(cm)).toBe(true);
    expect(cm.defineMode).toHaveBeenCalledWith(SPL_MODE_NAME, expect.any(Function));
    expect(cm.defineMIME).toHaveBeenCalledWith(SPL_MODE_MIME, SPL_MODE_NAME);
    expect(cm.modeInfo?.map((entry) => entry.name)).toEqual(["SPL", "Splunk"]);
    for (const entry of cm.modeInfo ?? []) {
      expect(entry.mode).toBe(SPL_MODE_NAME);
      expect(entry.mime).toBe(SPL_MODE_MIME);
    }
  });

  it("does not duplicate entries when registered twice", () => {
    const cm = makeRegistry();
    registerSPLEditorMode(cm);
    registerSPLEditorMode(cm);
    expect(cm.modeInfo).toHaveLength(2);
  });

  it("stashes shadowing entries and restores them on unregister", () => {
    const shadow: CodeMirrorModeInfoEntry = { name: "Splunk", mime: "text/x-other", mode: "other" };
    const aliased: CodeMirrorModeInfoEntry = { name: "Other", mode: "other", alias: ["spl"] };
    const unrelated: CodeMirrorModeInfoEntry = { name: "SQL", mode: "sql" };
    const cm = makeRegistry([shadow, aliased, unrelated]);
    registerSPLEditorMode(cm);
    expect(cm.modeInfo).not.toContain(shadow);
    expect(cm.modeInfo).not.toContain(aliased);
    expect(cm.modeInfo).toContain(unrelated);
    unregisterSPLEditorMode(cm);
    expect(cm.modeInfo).toContain(shadow);
    expect(cm.modeInfo).toContain(aliased);
    expect(cm.modeInfo?.some((entry) => entry.mode === SPL_MODE_NAME)).toBe(false);
  });

  it("leaves the registry as found after register then unregister", () => {
    const cm = makeRegistry();
    cm.modes[SPL_MODE_NAME] = {};
    cm.mimeModes[SPL_MODE_MIME] = {};
    registerSPLEditorMode(cm);
    unregisterSPLEditorMode(cm);
    expect(cm.modes[SPL_MODE_NAME]).toBeUndefined();
    expect(cm.mimeModes[SPL_MODE_MIME]).toBeUndefined();
    expect(cm.modeInfo).toEqual([]);
  });

  it("reports failure for a missing or malformed registry", () => {
    // Drop the key rather than set it to undefined: exactOptionalPropertyTypes
    // rejects the latter, and an older CodeMirror simply has no modeInfo.
    const { modeInfo: _unused, ...withoutModeInfo } = makeRegistry();
    expect(registerSPLEditorMode(undefined)).toBe(false);
    expect(registerSPLEditorMode(withoutModeInfo)).toBe(false);
    expect(registerSPLEditorMode({ ...makeRegistry(), defineMode: undefined as never })).toBe(
      false,
    );
    expect(() => unregisterSPLEditorMode(undefined)).not.toThrow();
  });
});
