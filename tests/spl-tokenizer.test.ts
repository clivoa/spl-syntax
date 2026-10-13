import { describe, expect, it } from "vitest";

import { tokenizeSPL, type SPLToken, type SPLTokenType } from "../src/spl-tokenizer";

const pairs = (source: string): Array<[SPLTokenType, string]> =>
  tokenizeSPL(source)
    .filter((token) => token.type !== "plain")
    .map((token) => [token.type, token.text]);

const typeOf = (source: string, text: string): SPLTokenType | undefined =>
  tokenizeSPL(source).find((token: SPLToken) => token.text === text)?.type;

describe("tokenizeSPL", () => {
  it("returns no tokens for empty input", () => {
    expect(tokenizeSPL("")).toEqual([]);
  });

  it("reproduces the input exactly", () => {
    const source = "index=main sourcetype=foo\n| stats count BY user\n| sort - count\n";
    expect(
      tokenizeSPL(source)
        .map((token) => token.text)
        .join(""),
    ).toBe(source);
  });

  it("classifies a basic pipeline", () => {
    expect(pairs("search index=main | stats count BY user")).toEqual([
      ["generating-command", "search"],
      ["identifier", "index"],
      ["operator", "="],
      ["identifier", "main"],
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
      ["keyword", "BY"],
      ["identifier", "user"],
    ]);
  });

  it("classifies uppercase SPL the same way", () => {
    expect(pairs("INDEX=main | STATS count BY USER")).toEqual([
      ["identifier", "INDEX"],
      ["operator", "="],
      ["identifier", "main"],
      ["pipe", "|"],
      ["processing-command", "STATS"],
      ["function", "count"],
      ["keyword", "BY"],
      ["identifier", "USER"],
    ]);
  });

  it("reads a triple backtick as a comment, not an empty macro", () => {
    expect(pairs("```only deltas``` | stats count")).toEqual([
      ["comment", "```only deltas```"],
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
    ]);
  });

  it("carries an unterminated comment to the end of input", () => {
    expect(pairs("| stats count ```note\nstill a comment")).toEqual([
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
      ["comment", "```note\nstill a comment"],
    ]);
  });

  it("reads a single backtick as a macro and stops at the line end", () => {
    expect(pairs("`security_indexes` | `drop_dm_object_name(Processes)`")).toEqual([
      ["macro", "`security_indexes`"],
      ["pipe", "|"],
      ["macro", "`drop_dm_object_name(Processes)`"],
    ]);
    expect(pairs("`unterminated\n| stats count")).toEqual([
      ["macro", "`unterminated"],
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
    ]);
  });

  it("keeps escaped quotes and backslashes inside strings", () => {
    expect(pairs('search path="C:\\\\Windows\\\\" AND msg="say \\"hi\\""')).toEqual([
      ["generating-command", "search"],
      ["identifier", "path"],
      ["operator", "="],
      ["string", '"C:\\\\Windows\\\\"'],
      ["operator", "AND"],
      ["identifier", "msg"],
      ["operator", "="],
      ["string", '"say \\"hi\\""'],
    ]);
  });

  it("ends an unterminated string at the line break", () => {
    expect(pairs('search msg="open\n| stats count')).toEqual([
      ["generating-command", "search"],
      ["identifier", "msg"],
      ["operator", "="],
      ["string", '"open'],
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
    ]);
  });

  it("reads single quotes as a field reference", () => {
    expect(typeOf("| eval x='field with spaces'", "'field with spaces'")).toBe("quoted-field");
  });

  it("requires an immediate parenthesis for a function", () => {
    expect(typeOf('| eval ok=if(count>5,"y","n")', "if")).toBe("function");
    expect(typeOf("| search index IN (main, web)", "IN")).toBe("operator");
    expect(typeOf("| eval ok=in(status, 200, 301)", "in")).toBe("function");
    expect(typeOf("| stats dc(user)", "dc")).toBe("function");
    expect(typeOf("| sort dc", "dc")).toBe("identifier");
    expect(typeOf("| sort duration", "duration")).toBe("identifier");
  });

  it("exempts bare count, the one aggregate SPL writes without parentheses", () => {
    expect(typeOf("| stats count BY user", "count")).toBe("function");
    expect(typeOf("| stats count(eval(status>=400))", "count")).toBe("function");
    // The documented cost of that exemption: the field stats produces reads as
    // a function too.
    expect(typeOf("| sort - count", "count")).toBe("function");
  });

  it("classifies percentile functions", () => {
    expect(typeOf("| stats perc95(duration)", "perc95")).toBe("function");
    expect(typeOf("| stats p99(duration)", "p99")).toBe("function");
  });

  it("marks underscore-prefixed fields as internal", () => {
    expect(typeOf("| stats max(_time)", "_time")).toBe("internal-field");
    expect(typeOf("| eval raw=_raw", "_raw")).toBe("internal-field");
    expect(typeOf("| table _indextime", "_indextime")).toBe("internal-field");
  });

  it("keeps wildcards inside identifiers and emits a bare asterisk as an operator", () => {
    // Asserted as full sequences, not by probing one token: picking "host" out
    // of "host=web-*" would pass even if the wildcard handling were wrong.
    expect(pairs("search *error*")).toEqual([
      ["generating-command", "search"],
      ["identifier", "*error*"],
    ]);
    expect(pairs("search host=web-*")).toEqual([
      ["generating-command", "search"],
      ["identifier", "host"],
      ["operator", "="],
      ["identifier", "web"],
      ["operator", "-"],
      ["operator", "*"],
    ]);
    expect(pairs("search sourcetype=WinEventLog:*")).toEqual([
      ["generating-command", "search"],
      ["identifier", "sourcetype"],
      ["operator", "="],
      ["identifier", "WinEventLog"],
      ["operator", "*"],
    ]);
    expect(typeOf("| stats count(*)", "*")).toBe("operator");
    expect(typeOf("| fields *", "*")).toBe("operator");
  });

  it("keeps a dotted data-model field as one identifier", () => {
    expect(pairs("| stats count BY Processes.dest")).toEqual([
      ["pipe", "|"],
      ["processing-command", "stats"],
      ["function", "count"],
      ["keyword", "BY"],
      ["identifier", "Processes.dest"],
    ]);
    expect(typeOf("| eval x=Processes._time", "Processes._time")).toBe("identifier");
  });

  it("reads a minus as an operator, never as part of the number", () => {
    expect(pairs("| eval x=a-1")).toEqual([
      ["pipe", "|"],
      ["processing-command", "eval"],
      ["identifier", "x"],
      ["operator", "="],
      ["identifier", "a"],
      ["operator", "-"],
      ["number", "1"],
    ]);
    expect(pairs("| eval y=-1")).toEqual([
      ["pipe", "|"],
      ["processing-command", "eval"],
      ["identifier", "y"],
      ["operator", "="],
      ["operator", "-"],
      ["number", "1"],
    ]);
    // The sign still belongs to a relative-time literal, which is matched first.
    expect(typeOf("search earliest=-24h@h", "-24h@h")).toBe("time-literal");
  });

  it("does not read the tail of a word as an internal field", () => {
    expect(typeOf("| eval n=1_000", "_000")).toBe("identifier");
    expect(typeOf("| table _time", "_time")).toBe("internal-field");
  });

  it("reads relative-time literals only when anchored by a sign or snap", () => {
    expect(typeOf("search earliest=-24h@h", "-24h@h")).toBe("time-literal");
    expect(typeOf("search earliest=-7d", "-7d")).toBe("time-literal");
    expect(typeOf("search latest=@d", "@d")).toBe("time-literal");
    expect(typeOf("search earliest=-1mon@mon", "-1mon@mon")).toBe("time-literal");
    expect(typeOf("search earliest=+7d@w1", "+7d@w1")).toBe("time-literal");
    expect(typeOf("search latest=now", "now")).toBe("time-literal");
    expect(typeOf("| eval t=now()", "now")).toBe("function");
    expect(typeOf("| eval x=24", "24")).toBe("number");
    expect(typeOf("| sort - count", "-")).toBe("operator");
  });

  it("brackets a subsearch as punctuation", () => {
    expect(pairs("| search [ search index=b | return user ]")).toEqual([
      ["pipe", "|"],
      ["generating-command", "search"],
      ["punctuation", "["],
      ["generating-command", "search"],
      ["identifier", "index"],
      ["operator", "="],
      ["identifier", "b"],
      ["pipe", "|"],
      ["processing-command", "return"],
      ["identifier", "user"],
      ["punctuation", "]"],
    ]);
  });
});
