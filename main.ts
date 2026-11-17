// makefun-frontend-01 entrypoint (Node 22, standard library only).
// The frontend is this directory's app/ — plain static files a browser opens
// at app/index.html, reading make.fun's public API. This program hands it in:
// it copies app/ and screenshots/ beside this file to /output and writes
// /output/dossier.json, the summary the judge reads (the screenshots, the
// first load's files and bytes, and the source), with the vendored make.fun
// library. Leave vendor/makefun-frontend.ts untouched: the scorer requires
// dossier.json to be byte for byte what its own copy writes.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The dossier's caps are the scorer's own: at most 3 screenshots of 256 KiB,
// at most 993 files and 16 MiB under app/, and the whole of /output under
// the platform's 1,000-entry, 64 MiB cap, so the dossier leaves room.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

function handIn() {
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_OPTIONS));
}

handIn();
