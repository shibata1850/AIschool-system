import {build} from 'esbuild';
// Compile the same plain-JS operational entry shipped by Docker, then start the fictional Canvas.
await build({entryPoints:['scripts/purge-quiz-reviews.ts'],bundle:true,platform:'node',format:'esm',target:'node22',
  packages:'external',alias:{'@':'./src'},outdir:'dist-scripts',outExtension:{'.js':'.mjs'}});
await import('./canvas.mjs');
