#!/usr/bin/env node
// STF dili komut satırı çeviricisi: .stf dosyasını Arduino C++'a çevirir.
//
//   node scripts/stf.js Program.stf            C++ kodunu ekrana yazar
//   node scripts/stf.js Program.stf -o out.cpp  dosyaya yazar
//   node scripts/stf.js --tokens Program.stf    token'ları gösterir
//   node scripts/stf.js --ast Program.stf       sözdizimi ağacını gösterir

import fs from 'node:fs';
import path from 'node:path';
import { cevir, hataSatiri, sozcukle, ayristir, StfHatasi } from '../src/common/stf/index.js';

const args = process.argv.slice(2);
const mod = args.find((a) => a === '--tokens' || a === '--ast');
const oIndex = args.indexOf('-o');
const cikti = oIndex >= 0 ? args[oIndex + 1] : null;
const girdi = args.find((a, i) => !a.startsWith('-') && (oIndex < 0 || i !== oIndex + 1));

if (!girdi) {
  console.error('Kullanım: node scripts/stf.js [--tokens | --ast] Program.stf [-o cikti.cpp]');
  process.exit(2);
}

const kaynak = fs.readFileSync(girdi, 'utf8');
const dosya = path.basename(girdi);

try {
  if (mod === '--tokens') {
    for (const t of sozcukle(kaynak)) console.log(`${t.line}:${t.col}\t${t.type}\t${JSON.stringify(t.value)}`);
    process.exit(0);
  }
  if (mod === '--ast') {
    console.log(JSON.stringify(ayristir(sozcukle(kaynak)), null, 2));
    process.exit(0);
  }
} catch (e) {
  if (!(e instanceof StfHatasi)) throw e;
  console.error(hataSatiri(dosya, { line: e.line, col: e.col, message: e.message }));
  process.exit(1);
}

const r = cevir(kaynak, { dosya });
if (r.hata) {
  console.error(hataSatiri(dosya, r.hata));
  process.exit(1);
}
if (cikti) fs.writeFileSync(cikti, r.kod);
else process.stdout.write(r.kod);
