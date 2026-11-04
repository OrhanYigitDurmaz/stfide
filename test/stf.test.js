import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cevir, sozcukle } from '../src/common/stf/index.js';

const kod = (src) => {
  const r = cevir(src, { dosya: 'T.stf', pinBasligi: null });
  assert.equal(r.hata, undefined, r.hata?.message);
  return r.kod;
};
const hata = (src) => {
  const r = cevir(src, { dosya: 'T.stf' });
  assert.ok(r.hata, 'hata bekleniyordu');
  return r.hata;
};

test('sözcükçü Türkçe harfleri, ekleri ve anahtar kelimeleri tanır', () => {
  const t = sozcukle("her sayaç için 1'den 10'a kadar");
  assert.deepEqual(t.map((x) => [x.type, x.value]).slice(0, 8), [
    ['anahtar', 'her'], ['ad', 'sayaç'], ['anahtar', 'için'], ['sayi', '1'], ['ek', 'den'],
    ['sayi', '10'], ['ek', 'a'], ['anahtar', 'kadar'],
  ]);
});

test('anahtar kelimeler Türkçe harfsiz de yazılabilir', () => {
  assert.equal(kod('dongu\n eger dogru ise\n  yak(13)\n degilse\n  sondur(13)\n son\nson'),
    kod('döngü\n eğer doğru ise\n  yak(13)\n değilse\n  söndür(13)\n son\nson'));
});

test('kur ve döngü setup/loop olur, kur stfkartBegin çağırır', () => {
  const c = kod('kur\n çıkış(13)\nson\ndöngü\n yak(13)\n bekle(500)\nson');
  assert.match(c, /void setup\(\) \{\n {2}stfkartBegin\(\);\n#line 2 "T.stf"\n {2}pinMode\(13, OUTPUT\);\n\}/);
  assert.match(c, /void loop\(\) \{\n {2}digitalWrite\(13, HIGH\);\n {2}delay\(500\);\n\}/);
});

test('eksik kur ve döngü boş olarak eklenir', () => {
  const c = kod('sayı x = 1');
  assert.match(c, /void setup\(\) \{\n {2}stfkartBegin\(\);\n\}/);
  assert.match(c, /void loop\(\) \{\n\}/);
});

test('değişkenler, diziler ve Türkçe adlar', () => {
  const c = kod('sabit sayı LED = 13\nondalık sıcaklık = 0.5\nsayı notalar[] = [262, 294]\nmetin ad = "Ayşe"\nbayt b[4]');
  assert.match(c, /const int LED = 13;/);
  assert.match(c, /float sicaklik = 0\.5;/);
  assert.match(c, /int notalar\[\] = \{262, 294\};/);
  assert.match(c, /String ad = "Ayşe";/);
  assert.match(c, /byte b\[4\];/);
});

test('eğer / değilse eğer / değilse ve mantık işleçleri', () => {
  const c = kod('döngü\n eğer a > 1 ve değil b veya c ise\n  x = 1\n değilse eğer a == 0 ise\n  x = 2\n değilse\n  x = 3\n son\nson');
  assert.match(c, /if \(a > 1 && !b \|\| c\) \{/);
  assert.match(c, /\} else if \(a == 0\) \{/);
  assert.match(c, /\} else \{\n {4}x = 3;\n {2}\}/);
});

test('değil karşılaştırmanın tamamını kapsar', () => {
  assert.match(kod('döngü\n eğer değil a == 5 ise\n  x = 1\n son\nson'), /if \(!\(a == 5\)\)/);
});

test('işlem önceliği korunur', () => {
  assert.match(kod('döngü\n x = (a + b) * c - d / 2\n y = a - (b - c)\nson'), /x = \(a \+ b\) \* c - d \/ 2;\n {2}y = a - \(b - c\);/);
});

test('döngüler: iken, kez, her, sürekli, kır, atla', () => {
  const c = kod([
    'döngü',
    ' iken x < 10 tekrarla', '  x++', ' son',
    ' 3 kez tekrarla', '  bekle(1)', ' son',
    " her i için 1'den 10'a kadar", '  atla', ' son',
    " her j için 10'dan 0'a kadar", ' son',
    " her k için 0'dan 100'e kadar adım 5 tekrarla", '  kır', ' son',
    ' sürekli tekrarla', ' son',
    'son',
  ].join('\n'));
  assert.match(c, /while \(x < 10\) \{\n {4}x\+\+;/);
  assert.match(c, /for \(int _tekrar1 = 0; _tekrar1 < 3; _tekrar1\+\+\) \{/);
  assert.match(c, /for \(int i = 1; i <= 10; i\+\+\) \{\n {4}continue;/);
  assert.match(c, /for \(int j = 10; j >= 0; j--\) \{/);
  assert.match(c, /for \(int k = 0; k <= 100; k \+= 5\) \{\n {4}break;/);
  assert.match(c, /while \(true\) \{/);
});

test('işlevler önceden bildirilir ve değer döndürür', () => {
  const c = kod('döngü\n yaz(kare(3))\nson\nişlev kare(sayı n) sayı\n döndür n * n\nson\nişlev selam()\n yaz("selam")\nson');
  assert.match(c, /^int kare\(int n\);\nvoid selam\(\);\n/m);
  assert.match(c, /int kare\(int n\) \{\n {2}return n \* n;\n\}/);
});

test('yaz değerleri yan yana yazar, sabit metinleri F() ile sarar', () => {
  const c = kod('döngü\n yaz("Isı: ", t, " C")\n yaz_satırsız(x)\n yaz()\nson');
  assert.match(c, /Serial\.print\(F\("Isı: "\)\); Serial\.print\(t\); Serial\.println\(F\(" C"\)\);/);
  assert.match(c, /Serial\.print\(x\);/);
  assert.match(c, /Serial\.println\(\);/);
});

test('metin + değer String ile birleştirilir', () => {
  assert.match(kod('döngü\n metin m = "x=" + x\nson'), /String m = String\("x="\) \+ x;/);
});

test('C++ ile çakışan adlar yeniden adlandırılır, devre adları olduğu gibi kalır', () => {
  const c = kod('sayı int = 1\nişlev delay()\nson\ndöngü\n delay()\n lcd.print(int)\n yak(kirmiziLed)\nson');
  assert.match(c, /int int_ = 1;/);
  assert.match(c, /void delay_\(\);/);
  assert.match(c, /lcd\.print\(int_\);/);
  assert.match(c, /digitalWrite\(kirmiziLed, HIGH\);/);
});

test('#line komutları hataları .stf satırına eşler', () => {
  const c = cevir('sayı x = 1\n\n\nkur\n\n  x = 2\nson', { dosya: 'Deneme.stf' }).kod;
  const satirlar = c.split('\n');
  // "x = 2;" satırının eşlendiği .stf satırını bul
  let eslenen = null;
  for (const s of satirlar) {
    const m = /^#line (\d+) "Deneme\.stf"$/.exec(s);
    if (m) {
      eslenen = Number(m[1]);
      continue;
    }
    if (s.trim() === 'x = 2;') break;
    if (eslenen != null) eslenen++;
  }
  assert.equal(eslenen, 6);
});

test('Türkçe hata mesajları ve doğru satır', () => {
  assert.deepEqual(hata('döngü\n eğer x = 5 ise\n son\nson'), { line: 2, col: 9, message: 'Karşılaştırmak için == kullan (tek = değer vermek içindir).' });
  assert.equal(hata('kur\n yak(13)\n').line, 1);
  assert.match(hata('kur\n yak(13)\n').message, /kapanmamış/);
  assert.match(hata('döngü\n eğer x == 5\n son\nson').message, /"ise" bekleniyordu/);
  assert.match(hata('yak(13)').message, /"kur" ya da "döngü" içine/);
  assert.match(hata('döngü\n bekle()\nson').message, /bekle 1 değer alır/);
  assert.match(hata('döngü\n kır\nson').message, /tekrarla bloğunun içinde/);
  assert.match(hata('sayı son = 3').message, /anahtar kelime/);
  assert.match(hata('işlev f()\n döndür 3\nson').message, /değer döndürmüyor/);
  assert.match(hata('döngü\n x\nson').message, /bir şey yapmıyor/);
  assert.match(hata("döngü\n her i için 1 10'a kadar\n son\nson").message, /'den/);
  assert.match(hata('döngü\n yak(13) bekle(1)\nson').message, /kendi satırında/);
  assert.match(hata("döngü\n yaz('a')\nson").message, /Tek tırnak/);
});
