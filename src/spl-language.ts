const words = (source: string): readonly string[] => source.trim().split(/\s+/);

const toUpperSet = (source: string): ReadonlySet<string> =>
  new Set(words(source).map((value) => value.toUpperCase()));

// Commands that start a search or produce their own events.
// https://help.splunk.com/en/splunk-enterprise/search/spl-search-reference/10.6/quick-reference/command-types
export const SPL_GENERATING_COMMANDS = toUpperSet(`
datamodel dbinspect eventcount from gentimes history inputcsv inputlookup loadjob
makeresults metadata metasearch mpreview msearch mstats multisearch pivot rest
savedsearch search searchtxn set tstats typeahead walklex
`);

// Every other command in the command quick reference. "search" lives in the
// generating set even though "| search" also filters mid-pipeline; both sets
// render as cm-keyword, so the one listing costs nothing.
// https://help.splunk.com/en/splunk-enterprise/search/spl-search-reference/10.6/quick-reference/command-quick-reference
export const SPL_PROCESSING_COMMANDS = toUpperSet(`
abstract accum addcoltotals addinfo addtotals analyzefields anomalies anomalousvalue
anomalydetection append appendcols appendpipe arules associate autoregress bin bucket
bucketdir chart cluster cofilter collect concurrency contingency convert correlate dedup
delete delta diff erex eval eventstats extract fieldformat fields fieldsummary filldown
fillnull findtypes folderize foreach format gauge geom geomfilter geostats head highlight
iconify iplocation join kmeans kvform localize localop lookup makecontinuous makemv map
mcollect meventcollect multikv mvcombine mvexpand nomv noop outlier outputcsv outputlookup
outputtext overlap predict rangemap rare redistribute regex reltime rename replace require
return reverse rex rtorder script scrub selfjoin sendalert sendemail setfields sichart
sirare sistats sitimechart sitop sort spath stats strcat streamstats table tags tail
timechart timewrap tojson top transaction transpose trendline tscollect typelearner typer
union uniq untable where x11 xmlkv xmlunescape xpath xyseries
`);

export const SPL_KEYWORDS = toUpperSet(`
AS BY OVER WITH OUTPUT OUTPUTNEW GROUPBY SORTBY ASC DESC TRUE FALSE NULL
`);

export const SPL_WORD_OPERATORS = toUpperSet(`AND OR NOT XOR LIKE IN`);

// Evaluation functions plus statistical and charting functions, merged: the
// plugin never needs to know whether a function is scalar or aggregate. The
// set is a deliberate superset across Splunk versions — highlighting a
// function the installed version lacks is harmless, missing one is visible.
// Bare "p" is omitted on purpose: a field named p followed by "(" is likelier
// than the undocumented bare form, and "p95" is handled by the suffix rule.
// https://help.splunk.com/en/splunk-enterprise/search/spl-search-reference/10.6/evaluation-functions/evaluation-functions
// https://help.splunk.com/en/splunk-enterprise/search/spl-search-reference/10.6/statistical-and-charting-functions/statistical-and-charting-functions
export const SPL_FUNCTIONS = toUpperSet(`
case cidrmatch coalesce false if in like lookup match null nullif searchmatch true
validate ipmask printf toarray tobool todouble toint tomv tonumber toobject tostring
md5 sha1 sha256 sha512 now relative_time strftime strptime time isarray isbool isdouble
isint ismv isnotnull isnull isnum isobject isstr typeof json json_append json_array
json_array_to_mv json_delete json_entries json_extend json_extract json_extract_exact
json_has_key_exact json_keys json_object json_set json_set_exact json_valid abs ceiling
exact exp floor ln log pi pow round sigfig sqrt sum commands mvappend mvcount mvdedup
mvfilter mvfind mvindex mvjoin mvmap mvrange mvsort mvzip mv_to_json_array split avg max
min random len lower ltrim replace rtrim spath substr trim upper urldecode acos acosh
asin asinh atan atan2 atanh cos cosh hypot sin sinh tan tanh
c count distinct_count dc estdc estdc_error exactperc mean median mode perc range stdev
stdevp sumsq upperperc var varp first last list values earliest earliest_time latest
latest_time per_day per_hour per_minute per_second rate rate_avg rate_sum sparkline
`);

// "| stats count BY user" is the most common line in SPL, so count must
// highlight without parentheses. The cost is that a field named count — which
// is exactly what stats produces, as in "| sort - count" — also renders as a
// function. Keeping the set to this one word bounds that cost: every other
// aggregate is written with parentheses.
export const SPL_BARE_FUNCTIONS = toUpperSet(`count`);

// perc<int>, p<int>, exactperc<int>, upperperc<int>. Written as an exact
// anchored test rather than a generic trailing-digit strip, so log10 does not
// become a function by way of log.
const PERCENTILE_FUNCTION = /^(?:P|PERC|PERCENTILE|EXACTPERC|UPPERPERC)\d+$/;

const TIME_UNITS = words(`
s sec secs second seconds m min mins minute minutes h hr hrs hour hours d day days
w week weeks w0 w1 w2 w3 w4 w5 w6 w7 mon month months q qtr qtrs quarter quarters
y yr yrs year years
`);

// Longest first so "months" is not cut short to "mon", and "seconds" not to "sec".
export const SPL_TIME_UNITS_SOURCE = `(?:${[...TIME_UNITS]
  .sort((a, b) => b.length - a.length)
  .join("|")})`;

export const normalizeSPLWord = (value: string): string => value.toUpperCase();

export const isSPLFunction = (value: string): boolean => {
  const normalized = normalizeSPLWord(value);
  return SPL_FUNCTIONS.has(normalized) || PERCENTILE_FUNCTION.test(normalized);
};

export const isSPLBareFunction = (value: string): boolean =>
  SPL_BARE_FUNCTIONS.has(normalizeSPLWord(value));

export const isSPLKeyword = (value: string): boolean => SPL_KEYWORDS.has(normalizeSPLWord(value));

export const isSPLWordOperator = (value: string): boolean =>
  SPL_WORD_OPERATORS.has(normalizeSPLWord(value));

export const isSPLGeneratingCommand = (value: string): boolean =>
  SPL_GENERATING_COMMANDS.has(normalizeSPLWord(value));

export const isSPLProcessingCommand = (value: string): boolean =>
  SPL_PROCESSING_COMMANDS.has(normalizeSPLWord(value));
