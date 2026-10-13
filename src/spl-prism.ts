import {
  SPL_BARE_FUNCTIONS,
  SPL_FUNCTIONS,
  SPL_GENERATING_COMMANDS,
  SPL_KEYWORDS,
  SPL_PROCESSING_COMMANDS,
  SPL_WORD_OPERATORS,
} from "./spl-language";
import { SPL_TIME_LITERAL_SOURCE } from "./spl-tokenizer";

export interface PrismLike {
  languages: Record<string, unknown>;
}

export const SPL_PRISM_LANGUAGES = ["spl", "splunk"] as const;

const escapeWord = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const alternation = (...groups: ReadonlySet<string>[]): string => {
  const words = new Set<string>(groups.flatMap((group) => [...group]));
  return [...words].sort((a, b) => b.length - a.length).map(escapeWord).join("|");
};

// Prism's `lookbehind: true` excludes capture group 1 from the match. SPL
// identifiers may contain "_", digits, ".", and "*", so both boundaries must
// reject those continuations rather than rely on \b.
const BEFORE = "(^|[^\\w.*])";
const AFTER = "(?![\\w*]|\\.[A-Za-z_])";
// No leading sign: a "-" is an operator, matching the tokenizer. Signed
// relative-time literals (-24h@h) are claimed earlier by the time-literal rule.
const NUMBER_SOURCE = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
// The tokenizer absorbs "." and "*" into identifiers (Processes.dest, *error*),
// so the grammar needs the same rule or those characters fall through to the
// operator pattern and tint in Reading View only. Leading asterisks count only
// when a word character follows, so a standalone "*" stays an operator — the
// ALL_ASTERISKS rejection in the tokenizer.
const IDENTIFIER_SOURCE = "[A-Za-z_][\\w*]*(?:\\.[\\w*]+)*|\\*+[A-Za-z0-9_][\\w*]*(?:\\.[\\w*]+)*";
// perc<int>, p<int>, exactperc<int>, upperperc<int> — mirrors
// PERCENTILE_FUNCTION in spl-language.ts.
const PERCENTILE_SOURCE = "(?:percentile|exactperc|upperperc|perc|p)\\d+";

export const buildSPLGrammar = (): Record<string, unknown> => ({
  // Triple before single, so ```a comment``` never scans as an empty macro.
  comment: { pattern: /```[\s\S]*?(?:```|$)/, greedy: true },
  // The "m" flag is what makes "$" mean end of line rather than end of input:
  // without it a delimiter left open while typing matches nothing at all on
  // every line but the last, and Reading View renders it unstyled while the
  // editor tints it.
  // The "\\?" before the line end is the dangling backslash a half-typed
  // escape leaves behind: the tokenizer's scanQuoted keeps it inside the
  // string rather than letting it eat the newline, so this must too.
  macro: { pattern: /`[^`\r\n]*(?:`|$)/m, greedy: true, alias: "variable" },
  string: { pattern: /"(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?$)/m, greedy: true },
  "quoted-field": {
    pattern: /'(?:\\[^\r\n]|[^'\\\r\n])*(?:'|\\?$)/m,
    greedy: true,
    alias: "string",
  },
  // "now(?!\\()" keeps now() on the function rule, which runs after this one.
  "time-literal": {
    pattern: new RegExp(`${BEFORE}(?:${SPL_TIME_LITERAL_SOURCE}|now(?!\\())${AFTER}`, "i"),
    lookbehind: true,
    alias: "number",
  },
  // Mirrors classifyIdentifier: bare words from SPL_BARE_FUNCTIONS, everything
  // else only with an immediately following parenthesis.
  function: {
    pattern: new RegExp(
      `${BEFORE}(?:(?:${alternation(SPL_BARE_FUNCTIONS)})${AFTER}|(?:${PERCENTILE_SOURCE}|${alternation(SPL_FUNCTIONS)})(?=\\())`,
      "i",
    ),
    lookbehind: true,
  },
  "word-operator": {
    pattern: new RegExp(`${BEFORE}(?:${alternation(SPL_WORD_OPERATORS)})${AFTER}`, "i"),
    lookbehind: true,
    alias: "operator",
  },
  "generating-command": {
    pattern: new RegExp(`${BEFORE}(?:${alternation(SPL_GENERATING_COMMANDS)})${AFTER}`, "i"),
    lookbehind: true,
    alias: "keyword",
  },
  "processing-command": {
    pattern: new RegExp(`${BEFORE}(?:${alternation(SPL_PROCESSING_COMMANDS)})${AFTER}`, "i"),
    lookbehind: true,
    alias: "keyword",
  },
  keyword: {
    pattern: new RegExp(`${BEFORE}(?:${alternation(SPL_KEYWORDS)})${AFTER}`, "i"),
    lookbehind: true,
  },
  // "\b" would also fire after a dot or a digit, promoting the tail of
  // Processes._time or of 1_000; the tokenizer only treats a name as internal
  // when the whole token starts with "_".
  "internal-field": {
    pattern: /(^|[^\w.])(_[A-Za-z0-9_]+)/,
    lookbehind: true,
    alias: "variable",
  },
  identifier: new RegExp(IDENTIFIER_SOURCE),
  number: { pattern: new RegExp(`${BEFORE}(?:${NUMBER_SOURCE})`), lookbehind: true },
  operator: /==|!=|<=|>=|[=<>|+\-*/%.]/,
  punctuation: /[{}()[\],]/,
});

export const definePrismSPL = (prism: PrismLike): void => {
  const grammar = buildSPLGrammar();
  for (const language of SPL_PRISM_LANGUAGES) {
    prism.languages[language] = grammar;
  }
};

export const removePrismSPL = (prism: PrismLike): void => {
  for (const language of SPL_PRISM_LANGUAGES) {
    delete prism.languages[language];
  }
};
