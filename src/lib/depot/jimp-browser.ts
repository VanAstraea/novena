// Jimp's browser build is a script that sets self.Jimp (and self.Buffer) instead of exporting a module. The browser
// build aliases "jimp" to this file (vite.config.ts) so the recogniser's `import Jimp from "jimp"` gets it.
import "jimp/browser/lib/jimp.js";

export default (self as unknown as { Jimp: typeof import("jimp") }).Jimp;
