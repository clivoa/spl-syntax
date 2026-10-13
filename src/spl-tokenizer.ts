import {
  isSPLBareFunction,
  isSPLFunction,
  isSPLGeneratingCommand,
  isSPLKeyword,
  isSPLProcessingCommand,
  isSPLWordOperator,
  normalizeSPLWord,
  SPL_TIME_UNITS_SOURCE,
} from "./spl-language";

export type SPLTokenType =
  | "generating-command" | "processing-command" | "keyword" | "function" | "macro"
  | "internal-field" | "quoted-field" | "string" | "comment" | "number" | "time-literal"
  | "pipe" | "operator" | "punctuation" | "identifier" | "plain";

export interface SPLToken {
  type: SPLTokenType;
  text: string;
}

// "*" and "." belong in identifiers because SPL wildcards sit inside words
// (*error*, WinEventLog:*) and data-model fields are dotted (Processes.dest);
// an all-asterisk match is rejected below so that a standalone "*" falls
// through to the operator rule. "-" and ":" are NOT identifier characters, so
// host=web-* is five tokens and WinEventLog:* is three — only the wildcard
// itself is a separate operator in those, which is what the colors show.
const IDENTIFIER = /^[A-Za-z_*][A-Za-z0-9_*]*(?:\.[A-Za-z0-9_*]+)*/;
const ALL_ASTERISKS = /^\*+$/;
// No leading sign: "-" is always an operator, so "a-1" and "x=-1" read the
// same way here as they do in the Prism grammar. Signed relative-time literals
// are claimed by TIME_LITERAL, which runs first.
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

// Anchored by a sign or a snap so it cannot swallow a plain identifier:
// -24h@h, -7d, +7d@w1, @d. A bare "now" is handled during identifier
// classification instead.
export const SPL_TIME_LITERAL_SOURCE =
  `(?:[+-]\\d+${SPL_TIME_UNITS_SOURCE}(?:@${SPL_TIME_UNITS_SOURCE})?|@${SPL_TIME_UNITS_SOURCE})`;
const TIME_LITERAL = new RegExp(`^${SPL_TIME_LITERAL_SOURCE}(?![A-Za-z0-9_])`, "i");

const SYMBOLIC_OPERATORS = ["==", "!=", "<=", ">=", "=", "<", ">", "+", "-", "*", "/", "%", "."];
const PUNCTUATION = "()[]{},";

const push = (tokens: SPLToken[], type: SPLTokenType, text: string): void => {
  if (text.length > 0) tokens.push({ type, text });
};

const scanDelimited = (source: string, start: number, close: string): number => {
  const closePosition = source.indexOf(close, start);
  return closePosition === -1 ? source.length : closePosition + close.length;
};

const lineEndFrom = (source: string, start: number): number => {
  const newline = source.indexOf("\n", start);
  return newline === -1 ? source.length : newline;
};

// A macro is single-line: refusing to continue one keeps the editor out of a
// runaway state while the author is still typing the closing backtick.
const scanMacro = (source: string, start: number): number => {
  const limit = lineEndFrom(source, start);
  const close = source.indexOf("`", start);
  return close === -1 || close > limit ? limit : close + 1;
};

const scanQuoted = (source: string, start: number, quote: string): number => {
  for (let position = start; position < source.length; position += 1) {
    const character = source[position];
    if (character === "\\") {
      // A trailing backslash must not consume the newline, or the string would
      // leak into the next line.
      if (source[position + 1] === "\n" || position + 1 >= source.length) return position + 1;
      position += 1;
      continue;
    }
    if (character === "\n") return position;
    if (character === quote) return position + 1;
  }
  return source.length;
};

const classifyIdentifier = (source: string, position: number, identifier: string): SPLTokenType => {
  // An underscore name is internal only where a name can start. After a word
  // character it is the tail of something else — the "_000" of 1_000 — which
  // Prism cannot see as internal either.
  const precededByWord = position > 0 && /[A-Za-z0-9_]/.test(source[position - 1] ?? "");
  if (identifier.startsWith("_") && !precededByWord) return "internal-field";
  if (isSPLBareFunction(identifier)) return "function";
  const immediatelyFollowedByParen = source[position + identifier.length] === "(";
  if (immediatelyFollowedByParen && isSPLFunction(identifier)) return "function";
  const normalized = normalizeSPLWord(identifier);
  if (normalized === "NOW") return "time-literal";
  if (isSPLGeneratingCommand(identifier)) return "generating-command";
  if (isSPLProcessingCommand(identifier)) return "processing-command";
  if (isSPLWordOperator(identifier)) return "operator";
  if (isSPLKeyword(identifier)) return "keyword";
  return "identifier";
};

export const tokenizeSPL = (source: string): SPLToken[] => {
  const tokens: SPLToken[] = [];

  for (let position = 0; position < source.length;) {
    const rest = source.slice(position);

    // Triple before single: ```a comment``` must never scan as an empty macro.
    if (rest.startsWith("```")) {
      const end = scanDelimited(source, position + 3, "```");
      push(tokens, "comment", source.slice(position, end));
      position = end;
      continue;
    }

    if (source[position] === "`") {
      const end = scanMacro(source, position + 1);
      push(tokens, "macro", source.slice(position, end));
      position = end;
      continue;
    }

    if (source[position] === '"') {
      const end = scanQuoted(source, position + 1, '"');
      push(tokens, "string", source.slice(position, end));
      position = end;
      continue;
    }

    if (source[position] === "'") {
      const end = scanQuoted(source, position + 1, "'");
      push(tokens, "quoted-field", source.slice(position, end));
      position = end;
      continue;
    }

    const whitespace = /^\s+/.exec(rest)?.[0];
    if (whitespace) {
      push(tokens, "plain", whitespace);
      position += whitespace.length;
      continue;
    }

    if (source[position] === "|") {
      push(tokens, "pipe", "|");
      position += 1;
      continue;
    }

    const timeLiteral = TIME_LITERAL.exec(rest)?.[0];
    if (timeLiteral) {
      push(tokens, "time-literal", timeLiteral);
      position += timeLiteral.length;
      continue;
    }

    const number = NUMBER.exec(rest)?.[0];
    if (number) {
      push(tokens, "number", number);
      position += number.length;
      continue;
    }

    const identifier = IDENTIFIER.exec(rest)?.[0];
    if (identifier && !ALL_ASTERISKS.test(identifier)) {
      push(tokens, classifyIdentifier(source, position, identifier), identifier);
      position += identifier.length;
      continue;
    }

    const symbolic = SYMBOLIC_OPERATORS.find((operator) => rest.startsWith(operator));
    if (symbolic) {
      push(tokens, "operator", symbolic);
      position += symbolic.length;
      continue;
    }

    const character = source[position]!;
    if (PUNCTUATION.includes(character)) {
      push(tokens, "punctuation", character);
      position += 1;
      continue;
    }

    push(tokens, "plain", character);
    position += 1;
  }

  return tokens;
};
