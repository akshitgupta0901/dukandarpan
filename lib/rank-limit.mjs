// How many google_maps results a check can see. There's no explicit limit in
// the code: lib/run-check.mjs sends no `start`/`num` param, so SerpApi returns
// its first page, which is 20 local_results (positions 1-20) in every stored
// response. A business past that isn't in the data, so "not found" means
// "not in the top 20".
export const MAPS_RESULTS_LIMIT = 20;
