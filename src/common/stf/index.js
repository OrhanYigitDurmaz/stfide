// STF dili: Türkçe sözdizimli, Arduino C++'a çevrilen küçük bir programlama dili.
//
//   kaynak (.stf) --sözcükçü--> token'lar --ayrıştırıcı--> AST --kod üretici--> C++
//
// Üretilen C++ kodunu STFIDE'deki arduino-cli derleyip STFKart'a yükler.

import { sozcukle } from './lexer.js';
import { ayristir } from './parser.js';
import { uret } from './codegen.js';
import { StfHatasi } from './errors.js';

export { StfHatasi } from './errors.js';
export { sozcukle, asciiYap, ANAHTAR_KELIMELER } from './lexer.js';
export { ayristir, TIPLER } from './parser.js';
export { uret, HAZIR_ISLEVLER } from './codegen.js';
export { YONTEMLER, GENEL_YONTEMLER, NESNE_TIPLERI, KUTUPHANE_ADLARI, HAZIR_NESNELER, devreNesneleri, harfsizBul } from './libraries.js';

export const STF_EXT = '.stf';

// kaynak: .stf dosyasının metni. dosya: hata satırlarında görünecek ad.
// Döner: { kod } ya da { hata: { line, col, message } }
// nesneler: Devre sekmesindeki nesnelerin tipleri, devreNesneleri(config) ile.
export function cevir(kaynak, { dosya = 'program.stf', pinBasligi = 'stfkart_pins.h', nesneler = {} } = {}) {
  try {
    const ast = ayristir(sozcukle(kaynak));
    const baslik = [
      `// ${dosya} dosyasından STFIDE tarafından üretildi. Bu dosyayı düzenleme.`,
      '#include <Arduino.h>',
      ...(pinBasligi ? [`#include "${pinBasligi}"`] : []),
      '',
    ];
    return { kod: uret(ast, { dosya, baslik, nesneler }) };
  } catch (e) {
    if (e instanceof StfHatasi) return { hata: { line: e.line, col: e.col, message: e.message } };
    throw e;
  }
}

// gcc biçiminde hata satırı: STFIDE'nin hata işaretleyicisi bunu tanır.
export function hataSatiri(dosya, hata) {
  return `${dosya}:${hata.line}:${hata.col}: error: ${hata.message}`;
}
