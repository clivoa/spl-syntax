import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Prism from "prismjs";
import { describe, expect, it } from "vitest";

import { buildSPLGrammar } from "../src/spl-prism";
import { tokenizeSPL } from "../src/spl-tokenizer";

// The tokenizer is the documented source of truth and the CodeMirror mode
// consumes it directly; the Prism grammar is a mirror. A disagreement between
// them is user-visible: the same block takes one set of colors in Live Preview
// and another in Reading View. This file pins the mirror to the original.
//
// Both engines' token names are mapped through one table — the spec's token
// table — so the comparison is about meaning, not about the per-engine CSS
// names (cm-bracket vs .token.punctuation) that carry it.
const CANONICAL: Record<string, string | null> = {
  "generating-command": "keyword",
  "processing-command": "keyword",
  keyword: "keyword",
  function: "function",
  macro: "variable",
  "internal-field": "variable",
  "quoted-field": "string",
  string: "string",
  comment: "comment",
  number: "number",
  "time-literal": "number",
  pipe: "operator",
  operator: "operator",
  "word-operator": "operator",
  punctuation: "punctuation",
  identifier: null,
  plain: null,
};

const canonical = (engine: string, type: string): string | null => {
  if (!(type in CANONICAL)) throw new Error(`${engine} produced unmapped token type "${type}"`);
  return CANONICAL[type] ?? null;
};

const grammar = buildSPLGrammar() as Prism.Grammar;

const tokenizerClasses = (source: string): Array<string | null> => {
  const output: Array<string | null> = [];
  for (const token of tokenizeSPL(source)) {
    const style = canonical("tokenizer", token.type);
    for (let index = 0; index < token.text.length; index += 1) output.push(style);
  }
  return output;
};

const prismClasses = (source: string): Array<string | null> => {
  const output: Array<string | null> = [];
  const walk = (value: unknown, inherited: string | null): void => {
    if (typeof value === "string") {
      for (let index = 0; index < value.length; index += 1) output.push(inherited);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, inherited);
      return;
    }
    const token = value as { type: string; content: unknown };
    walk(token.content, canonical("prism", token.type));
  };
  walk(Prism.tokenize(source, grammar), null);
  return output;
};

const describeDivergence = (source: string): string | null => {
  const fromTokenizer = tokenizerClasses(source);
  const fromPrism = prismClasses(source);
  for (let index = 0; index < Math.max(fromTokenizer.length, fromPrism.length); index += 1) {
    const mine = fromTokenizer[index];
    const theirs = fromPrism[index];
    if (mine === theirs) continue;
    const context = JSON.stringify(source.slice(Math.max(0, index - 12), index + 12));
    return `${JSON.stringify(source)} @${index} (${JSON.stringify(source[index] ?? "")} near ${context}): tokenizer=${mine} prism=${theirs}`;
  }
  return null;
};

const read = (path: string): string =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", path), "utf8");

const CORPUS: readonly string[] = [
  // Review-focus cases.
  "",
  "   ",
  "search msg=\"open\n| stats count",
  "`unterminated\n| stats count",
  "| eval x='unterminated\n| stats count",
  "| stats count ```note\nstill a comment",
  "```closed``` | stats count",
  "INDEX=main | STATS count BY USER",
  'search path="C:\\\\Windows\\\\System32\\\\" AND msg="say \\"hi\\""',
  'search msg="trailing backslash \\\n| stats count',
  'search msg="trailing backslash at end of input \\',
  "| eval x='trailing \\\n| stats count",
  "| stats count(*)",
  "| fields *",
  "search *error*",
  "search host=web-*",
  "search sourcetype=WinEventLog:*",
  // Everyday SPL.
  "index=main sourcetype=access_combined status>=400 earliest=-24h@h",
  "search index=main | stats count BY user",
  "| stats dc(user) AS users, perc95(duration) AS p95 BY host",
  '| eval risk=if(count>5,"high","low")',
  "| eval t=now() | eval u=strftime(_time, \"%F %T\")",
  "search latest=now earliest=-1mon@mon",
  "search earliest=+7d@w1 latest=@d",
  "| timechart span=1h count AS requests",
  "| search index IN (main, web) AND NOT status=200",
  "| eval x=a.b | eval y=my.field.name",
  "| stats count BY Processes.dest, Processes.user",
  "| eval name=Processes._time",
  "| eval pct=round(100*a/b,2)",
  "| eval x=a-1 | eval y=-1 | sort - count",
  "foo.bar=1 AND baz!=2",
  "| table _time, _raw, _indextime",
  "| eval n=1_000",
  "`security_indexes` | `drop_dm_object_name(Processes)`",
  "| eval x='field with spaces' | eval y=\"literal text\"",
  "| search [ search index=b | return user ]",
  '| rex field=process "(?<child_image>[^\\\\]+)$"',
  "| lookup user_roles user OUTPUT role",
  "| tstats summariesonly=true count FROM datamodel=Endpoint.Processes",
  "| where like(uri, \"%admin%\") OR cidrmatch(\"10.0.0.0/8\", src_ip)",
  "| makeresults | eval _raw=\"x\" | multikv",
  "```spanning\nmultiple lines``` | stats count",
];

describe("tokenizer and Prism grammar agree", () => {
  it("assigns the same class to every character of every corpus entry", () => {
    const divergences = CORPUS.map(describeDivergence).filter(
      (entry): entry is string => entry !== null,
    );
    expect(divergences).toEqual([]);
  });

  it("agrees on the shipped templates, the files the plugin advertises", () => {
    const divergences = ["getting-started.spl", "reporting.spl", "threat-hunting.spl"]
      .map((name) => describeDivergence(read(`templates/${name}`)))
      .filter((entry): entry is string => entry !== null);
    expect(divergences).toEqual([]);
  });

  it("covers every character, so neither engine can hide a gap", () => {
    for (const source of CORPUS) {
      expect(tokenizerClasses(source), JSON.stringify(source)).toHaveLength(source.length);
      expect(prismClasses(source), JSON.stringify(source)).toHaveLength(source.length);
    }
  });
});
