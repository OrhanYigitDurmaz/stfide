// STF dili: sözcükçü (lexer). Kaynak metni parçalara (token) böler.
//
// Token: { type, value, line, col }
//   type: 'sayi' | 'metin' | 'ad' | 'anahtar' | 'isaret' | 'ek' | 'satir' | 'son'
// Satır sonları parantez içinde değilse 'satir' token'ı olur; komutları ayırır.

import { StfHatasi } from './errors.js';

// Anahtar kelimeler. Türkçe harfsiz yazımlar da kabul edilir (eger, degilse...).
export const ANAHTAR_KELIMELER = [
  'kur', 'döngü', 'işlev', 'döndür', 'son',
  'eğer', 'ise', 'değilse',
  'iken', 'tekrarla', 'kez', 'her', 'için', 'kadar', 'adım', 'sürekli',
  'kır', 'atla', 'sabit', 'kütüphane', 'nesne',
  've', 'veya', 'değil',
  'sayı', 'uzun', 'ondalık', 'metin', 'mantık', 'bayt',
];

const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };

// "döngü" -> "dongu". C++ adları ASCII olmalı, anahtar kelimeler de bu biçimde karşılaştırılır.
export function asciiYap(s) {
  return s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_ASCII[c]);
}

const ANAHTAR = new Map(ANAHTAR_KELIMELER.map((k) => [asciiYap(k), k]));

const HARF = /[A-Za-z_çğıöşüÇĞİÖŞÜ]/;
const HARF_RAKAM = /[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]/;
const ISARETLER = ['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '++', '--',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', ',', '.'];

export function sozcukle(kaynak) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let derinlik = 0; // ( ve [ içindeyken satır sonu komutu bitirmez

  const ekle = (type, value, l, c) => tokens.push({ type, value, line: l, col: c });
  const ilerle = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (kaynak[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < kaynak.length) {
    const ch = kaynak[i];
    const l = line;
    const c = col;

    if (ch === '\n') {
      if (derinlik === 0 && tokens.length && tokens.at(-1).type !== 'satir') ekle('satir', '\n', l, c);
      ilerle();
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      ilerle();
      continue;
    }
    if (ch === '/' && kaynak[i + 1] === '/') {
      while (i < kaynak.length && kaynak[i] !== '\n') ilerle();
      continue;
    }
    if (ch === '/' && kaynak[i + 1] === '*') {
      const bitis = kaynak.indexOf('*/', i + 2);
      if (bitis < 0) throw new StfHatasi('Yorum kapanmamış: /* ile başlayan yorumu */ ile bitir.', l, c);
      ilerle(bitis + 2 - i);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let s = '';
      if (ch === '0' && /[xX]/.test(kaynak[i + 1])) {
        s = '0x';
        ilerle(2);
        while (/[0-9a-fA-F]/.test(kaynak[i] ?? '')) {
          s += kaynak[i];
          ilerle();
        }
      } else {
        while (/[0-9]/.test(kaynak[i] ?? '')) {
          s += kaynak[i];
          ilerle();
        }
        if (kaynak[i] === '.' && /[0-9]/.test(kaynak[i + 1] ?? '')) {
          s += '.';
          ilerle();
          while (/[0-9]/.test(kaynak[i] ?? '')) {
            s += kaynak[i];
            ilerle();
          }
        }
      }
      if (HARF.test(kaynak[i] ?? '')) throw new StfHatasi(`"${s}${kaynak[i]}" geçerli bir sayı değil.`, l, c);
      ekle('sayi', s, l, c);
      ekEkle();
      continue;
    }

    if (ch === '"') {
      let s = '';
      ilerle();
      for (;;) {
        if (i >= kaynak.length || kaynak[i] === '\n') throw new StfHatasi('Metin kapanmamış: " ile başlayan metni aynı satırda " ile bitir.', l, c);
        if (kaynak[i] === '"') break;
        if (kaynak[i] === '\\') {
          const e = kaynak[i + 1];
          if (!'nt"\\'.includes(e ?? '')) throw new StfHatasi(`Metinde bilinmeyen kaçış: \\${e ?? ''}. Kullanılabilenler: \\n \\t \\" \\\\`, line, col);
          s += `\\${e}`;
          ilerle(2);
          continue;
        }
        s += kaynak[i];
        ilerle();
      }
      ilerle();
      ekle('metin', s, l, c);
      continue;
    }

    if (HARF.test(ch)) {
      let s = '';
      while (i < kaynak.length && HARF_RAKAM.test(kaynak[i])) {
        s += kaynak[i];
        ilerle();
      }
      const anahtar = ANAHTAR.get(asciiYap(s));
      if (anahtar) ekle('anahtar', anahtar, l, c);
      else ekle('ad', s, l, c);
      if (!anahtar) ekEkle();
      continue;
    }

    if (ch === "'") throw new StfHatasi("Tek tırnak (') sadece 1'den, 10'a gibi eklerde kullanılır. Metin için \" kullan.", l, c);

    const isaret = ISARETLER.find((op) => kaynak.startsWith(op, i));
    if (isaret) {
      if (isaret === '(' || isaret === '[') derinlik++;
      if ((isaret === ')' || isaret === ']') && derinlik > 0) derinlik--;
      ekle('isaret', isaret, l, c);
      ilerle(isaret.length);
      if (isaret === ')' || isaret === ']') ekEkle();
      continue;
    }

    throw new StfHatasi(`Beklenmeyen karakter: "${ch}"`, l, c);
  }
  if (tokens.length && tokens.at(-1).type !== 'satir') ekle('satir', '\n', line, col);
  ekle('son', '', line, col);
  return tokens;

  // 1'den, 10'a, x'ten gibi ekler: hemen önceki parçaya yapışık ' ve harfler.
  function ekEkle() {
    if (kaynak[i] !== "'" || !HARF.test(kaynak[i + 1] ?? '')) return;
    const l = line;
    const c = col;
    ilerle();
    let s = '';
    while (i < kaynak.length && HARF_RAKAM.test(kaynak[i])) {
      s += kaynak[i];
      ilerle();
    }
    ekle('ek', s, l, c);
  }
}
