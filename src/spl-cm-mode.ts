import { tokenizeSPL, type SPLTokenType } from "./spl-tokenizer";

// Styles limited to names Obsidian's app.css colors (cm-keyword, cm-builtin,
// cm-string, cm-string-2, cm-comment, cm-number, cm-variable-2, cm-operator,
// cm-bracket); identifier and plain stay unstyled on purpose.
const CM_STYLES: Partial<Record<SPLTokenType, string>> = {
  "generating-command": "keyword",
  "processing-command": "keyword",
  keyword: "keyword",
  function: "builtin",
  macro: "variable-2",
  "internal-field": "variable-2",
  "quoted-field": "string-2",
  string: "string",
  comment: "comment",
  number: "number",
  "time-literal": "number",
  pipe: "operator",
  operator: "operator",
  punctuation: "bracket",
};

type Close = "```";

const CONTINUATION_STYLE: Record<Close, string> = { "```": "comment" };

interface LineSpan {
  end: number;
  style: string | null;
}

export interface SPLModeState {
  continuation: Close | null;
  spans: LineSpan[];
}

export interface SPLStream {
  string: string;
  pos: number;
}

export interface SPLMode {
  startState(): SPLModeState;
  copyState(state: SPLModeState): SPLModeState;
  blankLine(state: SPLModeState): void;
  token(stream: SPLStream, state: SPLModeState): string | null;
}

const isUnterminatedComment = (text: string): boolean =>
  text.startsWith("```") && !(text.length >= 6 && text.endsWith("```"));

const scanLine = (
  line: string,
  open: Close | null,
): { spans: LineSpan[]; continuation: Close | null } => {
  const spans: LineSpan[] = [];
  let offset = 0;
  if (open) {
    const closeAt = line.indexOf(open);
    if (closeAt === -1) {
      spans.push({ end: line.length, style: CONTINUATION_STYLE[open] });
      return { spans, continuation: open };
    }
    offset = closeAt + open.length;
    spans.push({ end: offset, style: CONTINUATION_STYLE[open] });
  }
  let continuation: Close | null = null;
  let position = offset;
  for (const token of tokenizeSPL(line.slice(offset))) {
    position += token.text.length;
    spans.push({ end: position, style: CM_STYLES[token.type] ?? null });
    // tokenizeSPL only leaves a comment unterminated at end of input, so an
    // unterminated opener is always the last token of the line.
    if (token.type === "comment" && isUnterminatedComment(token.text)) continuation = "```";
  }
  return { spans, continuation };
};

export const createSPLMode = (): SPLMode => ({
  startState: () => ({ continuation: null, spans: [] }),
  copyState: (state) => ({ continuation: state.continuation, spans: [...state.spans] }),
  blankLine: () => {
    // Blank lines change nothing: an open ``` keeps running.
  },
  token: (stream, state) => {
    if (stream.pos === 0) {
      const scan = scanLine(stream.string, state.continuation);
      state.spans = scan.spans;
      state.continuation = scan.continuation;
    }
    const span = state.spans.find((candidate) => candidate.end > stream.pos);
    stream.pos = span ? span.end : stream.string.length;
    return span?.style ?? null;
  },
});

export interface CodeMirrorModeInfoEntry {
  name: string;
  mime?: string;
  mimes?: string[];
  mode: string;
  alias?: string[];
}

export interface CodeMirrorRegistry {
  defineMode(name: string, factory: () => SPLMode): void;
  defineMIME(mime: string, spec: string): void;
  modes: Record<string, unknown>;
  mimeModes: Record<string, unknown>;
  modeInfo?: CodeMirrorModeInfoEntry[];
}

export const SPL_MODE_NAME = "spl";
export const SPL_MODE_MIME = "text/x-spl";

// Two modeInfo entries share one mode so the Live Preview flair reads "SPL"
// for ```spl fences and "Splunk" for ```splunk fences.
const MODE_INFO_NAMES = ["SPL", "Splunk"] as const;

const OUR_LANGUAGES = new Set<string>(MODE_INFO_NAMES.map((name) => name.toLowerCase()));

const shadowsOurLanguages = (entry: CodeMirrorModeInfoEntry): boolean =>
  OUR_LANGUAGES.has(entry.name.toLowerCase()) ||
  (entry.alias ?? []).some((alias) => OUR_LANGUAGES.has(alias.toLowerCase()));

// findModeByName returns the first name/alias match in modeInfo order, so any
// entry that shadows "spl" or "splunk" must be removed while this plugin is
// active and restored when it unloads.
let stashedEntries: CodeMirrorModeInfoEntry[] = [];

export const registerSPLEditorMode = (cm: CodeMirrorRegistry | undefined): boolean => {
  if (
    !cm ||
    typeof cm.defineMode !== "function" ||
    typeof cm.defineMIME !== "function" ||
    !Array.isArray(cm.modeInfo)
  ) {
    return false;
  }
  cm.defineMode(SPL_MODE_NAME, createSPLMode);
  cm.defineMIME(SPL_MODE_MIME, SPL_MODE_NAME);
  for (let index = cm.modeInfo.length - 1; index >= 0; index -= 1) {
    const entry = cm.modeInfo[index];
    if (entry && entry.mode !== SPL_MODE_NAME && shadowsOurLanguages(entry)) {
      stashedEntries.push(entry);
      cm.modeInfo.splice(index, 1);
    }
  }
  for (const name of MODE_INFO_NAMES) {
    if (!cm.modeInfo.some((entry) => entry.name === name && entry.mode === SPL_MODE_NAME)) {
      cm.modeInfo.push({ name, mime: SPL_MODE_MIME, mode: SPL_MODE_NAME });
    }
  }
  return true;
};

export const unregisterSPLEditorMode = (cm: CodeMirrorRegistry | undefined): void => {
  if (!cm) return;
  if (cm.modes) delete cm.modes[SPL_MODE_NAME];
  if (cm.mimeModes) delete cm.mimeModes[SPL_MODE_MIME];
  if (Array.isArray(cm.modeInfo)) {
    for (let index = cm.modeInfo.length - 1; index >= 0; index -= 1) {
      if (cm.modeInfo[index]?.mode === SPL_MODE_NAME) cm.modeInfo.splice(index, 1);
    }
    cm.modeInfo.push(...stashedEntries);
  }
  stashedEntries = [];
};
