// Run ON THE TV with node: builds the patched surface-manager config from the ORIGINAL
// (reads the squashfs file underneath any existing bind-mount via the .orig copy).
// usage: node make-patched-config.js <original.json> <out.json> <filter.js>
var fs = require("fs");
var src = process.argv[2], out = process.argv[3], filt = process.argv[4];
var j = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(j.keyFilters)) throw new Error("no keyFilters array");
j.keyFilters = j.keyFilters.filter(function (k) { return k.handler !== "handleMyHomeKeys"; });
// FIRST in the chain (2026-11-20): HOME and ⋯ must be ours before preProcess.handleLongPressKeys
// (long ⋯ = LG audio description) or handleScreenSaver get them. Our filter only claims HOME/SETTINGS/SOURCE/⋯;
// every other key returns NextPolicy, so the stock chain is unchanged for them.
j.keyFilters.unshift({ file: filt, handler: "handleMyHomeKeys" });
fs.writeFileSync(out, JSON.stringify(j, null, 4));
console.log("ok, filters:", j.keyFilters.length, "inserted at", 0);
