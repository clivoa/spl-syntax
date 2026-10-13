import Prism from "prismjs";
import { describe, expect, it } from "vitest";

import {
  buildSPLGrammar,
  definePrismSPL,
  removePrismSPL,
  SPL_PRISM_LANGUAGES,
  type PrismLike,
} from "../src/spl-prism";

type Flat = Array<[string, string]>;

const flatten = (tokens: ReturnType<typeof Prism.tokenize>): Flat => {
  const output: Flat = [];
  const walk = (value: unknown, inherited: string | null): void => {
    if (typeof value === "string") {
      if (inherited) output.push([inherited, value]);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, inherited);
      return;
    }
    const token = value as { type: string; content: unknown };
    if (typeof token.content === "string") {
      output.push([token.type, token.content]);
      return;
    }
    walk(token.content, token.type);
  };
  walk(tokens, null);
  return output;
};

const grammar = buildSPLGrammar() as Prism.Grammar;
const typeOf = (code: string, text: string): string | undefined =>
  flatten(Prism.tokenize(code, grammar)).find((entry) => entry[1] === text)?.[0];

describe("SPL Prism grammar", () => {
  it("orders patterns so delimiters win over words", () => {
    expect(Object.keys(grammar)).toEqual([
      "comment",
      "macro",
      "string",
      "quoted-field",
      "time-literal",
      "function",
      "word-operator",
      "generating-command",
      "processing-command",
      "keyword",
      "internal-field",
      "identifier",
      "number",
      "operator",
      "punctuation",
    ]);
  });

  it("absorbs dotted and wildcarded identifiers so they stay unstyled", () => {
    expect(typeOf("| stats count BY Processes.dest", "Processes.dest")).toBe("identifier");
    expect(typeOf("search *error*", "*error*")).toBe("identifier");
    expect(typeOf("| eval x=Processes._time", "Processes._time")).toBe("identifier");
    expect(typeOf("| fields *", "*")).toBe("operator");
    expect(typeOf("| table _time", "_time")).toBe("internal-field");
  });

  it("styles a delimiter left open on a line that is not the last", () => {
    expect(typeOf('search msg="open\n| stats count', '"open')).toBe("string");
    expect(typeOf("`open\n| stats count", "`open")).toBe("macro");
    expect(typeOf("| eval x='open\n| stats count", "'open")).toBe("quoted-field");
  });

  it("classifies the same sample as the tokenizer does", () => {
    const code = "search index=main earliest=-24h@h | stats perc95(d) BY _time";
    expect(typeOf(code, "search")).toBe("generating-command");
    expect(typeOf(code, "stats")).toBe("processing-command");
    expect(typeOf(code, "perc95")).toBe("function");
    expect(typeOf(code, "BY")).toBe("keyword");
    expect(typeOf(code, "-24h@h")).toBe("time-literal");
    expect(typeOf(code, "_time")).toBe("internal-field");
  });

  it("reads a triple backtick as a comment and a single one as a macro", () => {
    expect(typeOf("```note``` | stats count", "```note```")).toBe("comment");
    expect(typeOf("`security_indexes` | stats count", "`security_indexes`")).toBe("macro");
  });

  it("separates double-quoted strings from single-quoted field references", () => {
    expect(typeOf('search msg="boom"', '"boom"')).toBe("string");
    expect(typeOf("| eval x='my field'", "'my field'")).toBe("quoted-field");
    expect(typeOf('search m="say \\"hi\\""', '"say \\"hi\\""')).toBe("string");
  });

  it("classifies uppercase SPL the same way", () => {
    expect(typeOf("INDEX=main | STATS count BY user", "STATS")).toBe("processing-command");
    expect(typeOf("search a AND b", "AND")).toBe("word-operator");
  });

  it("prefers the longest function name", () => {
    expect(typeOf("| stats distinct_count(user)", "distinct_count")).toBe("function");
  });

  it("mirrors the tokenizer on bare count and on now", () => {
    expect(typeOf("| stats count BY user", "count")).toBe("function");
    expect(typeOf("| stats dc(user)", "dc")).toBe("function");
    expect(typeOf("| eval t=now()", "now")).toBe("function");
    expect(typeOf("search latest=now", "now")).toBe("time-literal");
  });

  it("carries aliases that Obsidian already colors", () => {
    const aliases = Object.fromEntries(
      Object.entries(grammar).map(([key, value]) => [
        key,
        (value as { alias?: string }).alias ?? null,
      ]),
    );
    expect(aliases["macro"]).toBe("variable");
    expect(aliases["internal-field"]).toBe("variable");
    expect(aliases["quoted-field"]).toBe("string");
    expect(aliases["time-literal"]).toBe("number");
    expect(aliases["word-operator"]).toBe("operator");
    expect(aliases["generating-command"]).toBe("keyword");
    expect(aliases["processing-command"]).toBe("keyword");
  });

  it("defines and removes both language keys", () => {
    const prism: PrismLike = { languages: {} };
    definePrismSPL(prism);
    for (const language of SPL_PRISM_LANGUAGES) {
      expect(prism.languages[language]).toBeDefined();
    }
    removePrismSPL(prism);
    for (const language of SPL_PRISM_LANGUAGES) {
      expect(prism.languages[language]).toBeUndefined();
    }
  });
});
