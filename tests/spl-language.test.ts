import { describe, expect, it } from "vitest";

import {
  isSPLBareFunction,
  isSPLFunction,
  isSPLGeneratingCommand,
  isSPLKeyword,
  isSPLProcessingCommand,
  isSPLWordOperator,
  normalizeSPLWord,
  SPL_BARE_FUNCTIONS,
  SPL_FUNCTIONS,
  SPL_GENERATING_COMMANDS,
  SPL_KEYWORDS,
  SPL_PROCESSING_COMMANDS,
  SPL_TIME_UNITS_SOURCE,
  SPL_WORD_OPERATORS,
} from "../src/spl-language";

const sets = {
  generating: SPL_GENERATING_COMMANDS,
  processing: SPL_PROCESSING_COMMANDS,
  keywords: SPL_KEYWORDS,
  operators: SPL_WORD_OPERATORS,
  functions: SPL_FUNCTIONS,
  bare: SPL_BARE_FUNCTIONS,
};

describe("SPL lexicon", () => {
  it("stores every word uppercase and non-empty", () => {
    for (const [label, set] of Object.entries(sets)) {
      expect(set.size, label).toBeGreaterThan(0);
      for (const word of set) {
        expect(word, label).toBe(word.toUpperCase());
        expect(word.length, label).toBeGreaterThan(0);
      }
    }
  });

  it("never lists a command as both generating and processing", () => {
    const overlap = [...SPL_GENERATING_COMMANDS].filter((word) =>
      SPL_PROCESSING_COMMANDS.has(word),
    );
    expect(overlap).toEqual([]);
  });

  it("classifies commands case-insensitively", () => {
    expect(isSPLGeneratingCommand("tstats")).toBe(true);
    expect(isSPLGeneratingCommand("TSTATS")).toBe(true);
    expect(isSPLGeneratingCommand("search")).toBe(true);
    expect(isSPLProcessingCommand("search")).toBe(false);
    expect(isSPLProcessingCommand("streamstats")).toBe(true);
    expect(isSPLProcessingCommand("Timechart")).toBe(true);
    expect(isSPLProcessingCommand("sourcetype")).toBe(false);
  });

  it("classifies keywords and word operators", () => {
    expect(isSPLKeyword("by")).toBe(true);
    expect(isSPLKeyword("OUTPUTNEW")).toBe(true);
    expect(isSPLWordOperator("and")).toBe(true);
    expect(isSPLWordOperator("XOR")).toBe(true);
    expect(isSPLWordOperator("user")).toBe(false);
  });

  it("recognizes functions from both the eval and stats references", () => {
    for (const name of ["if", "coalesce", "strftime", "cidrmatch", "json_extract", "mvindex"]) {
      expect(isSPLFunction(name), name).toBe(true);
    }
    for (const name of ["count", "distinct_count", "dc", "stdevp", "sparkline", "per_hour"]) {
      expect(isSPLFunction(name), name).toBe(true);
    }
    expect(isSPLFunction("sourcetype")).toBe(false);
  });

  it("allows count without parentheses and nothing else", () => {
    expect(isSPLBareFunction("count")).toBe(true);
    expect(isSPLBareFunction("COUNT")).toBe(true);
    expect(isSPLBareFunction("dc")).toBe(false);
    expect(isSPLBareFunction("c")).toBe(false);
    expect(SPL_BARE_FUNCTIONS.size).toBe(1);
    for (const word of SPL_BARE_FUNCTIONS) {
      expect(SPL_FUNCTIONS.has(word)).toBe(true);
    }
  });

  it("recognizes percentile functions with a numeric suffix", () => {
    for (const name of ["perc95", "p99", "exactperc50", "upperperc95", "PERC5"]) {
      expect(isSPLFunction(name), name).toBe(true);
    }
    expect(isSPLFunction("p")).toBe(false);
    expect(isSPLFunction("perc")).toBe(true);
    expect(isSPLFunction("log10")).toBe(false);
  });

  it("orders time units longest first so plural units win", () => {
    const pattern = new RegExp(`^${SPL_TIME_UNITS_SOURCE}$`, "i");
    for (const unit of ["s", "secs", "seconds", "m", "mon", "months", "w0", "w6", "qtr", "years"]) {
      expect(pattern.test(unit), unit).toBe(true);
    }
    const prefixMatch = new RegExp(SPL_TIME_UNITS_SOURCE, "i").exec("months");
    expect(prefixMatch?.[0]).toBe("months");
  });

  it("normalizes words to uppercase", () => {
    expect(normalizeSPLWord("Stats")).toBe("STATS");
  });
});
