// Monaco support for the STF language (.stf files): colors, auto-indent,
// and autocomplete with Turkish keywords, built-in functions and the pin and
// component names from the Circuit tab.

import {
  harfsizBul, ANAHTAR_KELIMELER, GENEL_YONTEMLER, HAZIR_ISLEVLER, HAZIR_NESNELER, KUTUPHANE_ADLARI, NESNE_TIPLERI, TIPLER, YONTEMLER,
  asciiYap, devreNesneleri,
} from '../common/stf/index.js';
import { codeSymbols } from '../common/pins.js';

const SABITLER = ['doğru', 'yanlış', 'YÜKSEK', 'DÜŞÜK', 'DAHİLİ_LED', 'KART_LEDİ', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'LED_BUILTIN'];
// "yaz(\"x\")" -> "yaz"
const HAZIR_ADLAR = HAZIR_ISLEVLER.map((o) => o.slice(0, o.indexOf('(')));

// Blok kalıpları: etiket, eklenecek metin, açıklama
const KALIPLAR = [
  ['eğer', 'eğer ${1:koşul} ise\n\t$0\nson', 'Koşul doğruysa çalışır'],
  ['eğer değilse', 'eğer ${1:koşul} ise\n\t$2\ndeğilse\n\t$0\nson', 'Koşula göre iki yoldan biri'],
  ['kez tekrarla', '${1:5} kez tekrarla\n\t$0\nson', 'Bloğu N kez çalıştırır'],
  ['her', "her ${1:i} için ${2:1}'den ${3:10}'a kadar\n\t$0\nson", 'Sayaçla döngü'],
  ['iken tekrarla', 'iken ${1:koşul} tekrarla\n\t$0\nson', 'Koşul doğru oldukça tekrarlar'],
  ['sürekli tekrarla', 'sürekli tekrarla\n\t$0\nson', 'Hiç durmadan tekrarlar (kır ile çıkılır)'],
  ['işlev', 'işlev ${1:ad}(${2})\n\t$0\nson', 'Yeni bir işlev (fonksiyon)'],
  ['kur', 'kur\n\t$0\nson', 'Kart açılınca bir kez çalışır'],
  ['nesne', 'nesne ${1|Servo,LcdEkran,DhtSensör,NeoPiksel,YazılımSeri,TekTel,SıcaklıkSensörleri|} ${2:ad}', 'Kütüphaneden bir nesne (Servo, LCD ekran...)'],
  ['kütüphane', 'kütüphane ${1|servo,lcd,dht,neopiksel,yazılım_seri,tek_tel,sıcaklık_sensörleri,wire,spi,eeprom|}', 'Bir kütüphaneyi ekler'],
  ['döngü', 'döngü\n\t$0\nson', 'Sürekli tekrar eder'],
];

let registered = false;

export function registerStfLanguage(monaco, getConfig) {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: 'stf', extensions: ['.stf'] });

  const kelimeler = ANAHTAR_KELIMELER.filter((k) => !TIPLER.includes(k));
  monaco.languages.setMonarchTokensProvider('stf', {
    keywords: kelimeler,
    types: TIPLER,
    builtins: HAZIR_ADLAR,
    constants: SABITLER,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'[A-Za-zçğıöşüÇĞİÖŞÜ]+/, 'keyword'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+(\.\d+)?/, 'number'],
        [/[A-Za-z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*/, {
          cases: {
            '@keywords': 'keyword',
            '@types': 'type',
            '@builtins': 'predefined',
            '@constants': 'constant',
            '@default': 'identifier',
          },
        }],
        [/[=<>!+\-*/%]+/, 'operator'],
        [/[()[\],.]/, 'delimiter'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('stf', {
    wordPattern: /[A-Za-z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*|\d+(\.\d+)?/,
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['(', ')'], ['[', ']']],
    autoClosingPairs: [{ open: '(', close: ')' }, { open: '[', close: ']' }, { open: '"', close: '"', notIn: ['string'] }],
    surroundingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
    indentationRules: {
      increaseIndentPattern: /^\s*(kur|döngü|dongu|işlev|islev|her|iken|sürekli|surekli|değilse|degilse)\b.*$|\b(ise|tekrarla|kadar)\s*$/,
      decreaseIndentPattern: /^\s*(son|değilse|degilse)\b/,
    },
  });

  const K = monaco.languages.CompletionItemKind;
  const Rule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  // Nesne adı -> C++ tipi: Devre sekmesi, hazır nesneler ve dosyadaki "nesne" satırları.
  const nesneTipleri = (model) => {
    const map = new Map(Object.entries({ ...HAZIR_NESNELER, ...devreNesneleri(getConfig()) }).map(([k, v]) => [asciiYap(k), v]));
    for (const m of model.getValue().matchAll(/^\s*nesne\s+([\wçğıöşüÇĞİÖŞÜ]+)\s+([\wçğıöşüÇĞİÖŞÜ]+)/gm)) {
      map.set(asciiYap(m[2]), harfsizBul(NESNE_TIPLERI, m[1], asciiYap)?.cpp ?? m[1]);
    }
    return map;
  };

  monaco.languages.registerCompletionItemProvider('stf', {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const items = [];
      // "ekran." -> o nesnenin Türkçe metotları
      const once = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const uye = /([A-Za-z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*)\.$/.exec(once);
      if (uye) {
        const tip = nesneTipleri(model).get(asciiYap(uye[1]));
        const tablo = (tip && YONTEMLER[tip]) || GENEL_YONTEMLER;
        for (const [tr, en] of Object.entries(tablo)) {
          items.push({ label: tr, kind: K.Method, detail: `${tip ?? ''}.${en}()`, insertText: `${tr}($0)`, insertTextRules: Rule, range, sortText: `0${tr}` });
        }
        return { suggestions: items };
      }
      for (const sym of codeSymbols(getConfig() ?? { pins: {}, components: [] })) {
        items.push({ label: sym.name, kind: sym.kind === 'pin' ? K.Variable : K.Module, detail: sym.detail, insertText: sym.name, range, sortText: `0${sym.name}` });
      }
      for (const ornek of HAZIR_ISLEVLER) {
        const ad = ornek.slice(0, ornek.indexOf('('));
        const args = ornek.slice(ad.length + 1, -1);
        const snippet = args ? `${ad}(\${1:${args}})` : `${ad}()`;
        items.push({ label: ad, kind: K.Function, detail: ornek, insertText: snippet, insertTextRules: Rule, range, sortText: `1${ad}` });
      }
      for (const [label, insertText, doc] of KALIPLAR) {
        items.push({ label, kind: K.Snippet, insertText, insertTextRules: Rule, documentation: doc, range, sortText: `2${label}` });
      }
      for (const k of [...kelimeler, ...TIPLER]) items.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: `3${k}` });
      for (const tip of Object.keys(NESNE_TIPLERI)) items.push({ label: tip, kind: K.Class, detail: NESNE_TIPLERI[tip].cpp, insertText: tip, range, sortText: `5${tip}` });
      for (const k of Object.keys(KUTUPHANE_ADLARI)) items.push({ label: k, kind: K.Module, detail: KUTUPHANE_ADLARI[k].join(', '), insertText: k, range, sortText: `6${k}` });
      for (const c of SABITLER) items.push({ label: c, kind: K.Constant, insertText: c, range, sortText: `4${c}` });
      return { suggestions: items };
    },
  });
}
