// STF dili: kod üretici. Sözdizimi ağacını (AST) Arduino C++ koduna çevirir.
//
// Her komutun önüne gerektiğinde `#line N "Dosya.stf"` yazılır; böylece C++
// derleyicisinin hataları .stf dosyasındaki doğru satırı gösterir.

import { StfHatasi } from './errors.js';
import { asciiYap } from './lexer.js';
import { HAZIR_NESNELER, KUTUPHANE_ADLARI, NESNE_TIPLERI, YAZDIRMA, harfsizBul, yontemBul } from './libraries.js';

const TIP_CPP = { sayı: 'int', uzun: 'long', ondalık: 'float', metin: 'String', mantık: 'bool', bayt: 'byte' };

// Sabit değerler (Türkçe harfsiz yazımları da kabul edilir).
const SABITLER = { dogru: 'true', yanlis: 'false', YUKSEK: 'HIGH', DUSUK: 'LOW' };

// Kullanıcı bu adlarla değişken/işlev tanımlarsa C++'ta sonuna _ eklenir.
const AYRILMIS = new Set(`alignas alignof and asm auto bool break case catch char class const constexpr
continue default delete do double else enum explicit export extern false float for friend goto if inline
int long mutable namespace new noexcept not nullptr operator or private protected public register return
short signed sizeof static struct switch template this throw true try typedef typeid typename union
unsigned using virtual void volatile while xor setup loop main byte boolean word String Serial HIGH LOW
INPUT OUTPUT INPUT_PULLUP pinMode digitalWrite digitalRead analogRead analogWrite delay delayMicroseconds
millis micros tone noTone map constrain random abs min max sqrt pow sin cos tan pulseIn bit round
stfkartBegin F A0 A1 A2 A3 A4 A5 LED_BUILTIN PI`.split(/\s+/));

// Hazır işlevler: Türkçe ad (harfsiz yazım) -> C++ üretici.
// en/ek: en az / en çok argüman sayısı. ornek: hata mesajında gösterilir.
const HAZIR = {
  cikis: { en: 1, ek: 1, ornek: 'çıkış(13)', cpp: (a) => `pinMode(${a[0]}, OUTPUT)` },
  giris: { en: 1, ek: 1, ornek: 'giriş(2)', cpp: (a) => `pinMode(${a[0]}, INPUT)` },
  giris_direncli: { en: 1, ek: 1, ornek: 'giriş_dirençli(2)', cpp: (a) => `pinMode(${a[0]}, INPUT_PULLUP)` },
  yak: { en: 1, ek: 1, ornek: 'yak(13)', cpp: (a) => `digitalWrite(${a[0]}, HIGH)` },
  sondur: { en: 1, ek: 1, ornek: 'söndür(13)', cpp: (a) => `digitalWrite(${a[0]}, LOW)` },
  dijital_yaz: { en: 2, ek: 2, ornek: 'dijital_yaz(13, YÜKSEK)', cpp: (a) => `digitalWrite(${a[0]}, ${a[1]})` },
  oku: { en: 1, ek: 1, ornek: 'oku(2)', cpp: (a) => `digitalRead(${a[0]})` },
  // Düğme GND'ye bağlı ve iç direnç açık: basılıyken LOW okunur.
  basili_mi: { en: 1, ek: 1, ornek: 'basılı_mı(düğme)', cpp: (a) => `(digitalRead(${a[0]}) == LOW)` },
  analog_oku: { en: 1, ek: 1, ornek: 'analog_oku(A0)', cpp: (a) => `analogRead(${a[0]})` },
  analog_yaz: { en: 2, ek: 2, ornek: 'analog_yaz(9, 128)', cpp: (a) => `analogWrite(${a[0]}, ${a[1]})` },
  bekle: { en: 1, ek: 1, ornek: 'bekle(1000)', cpp: (a) => `delay(${a[0]})` },
  bekle_mikro: { en: 1, ek: 1, ornek: 'bekle_mikro(10)', cpp: (a) => `delayMicroseconds(${a[0]})` },
  milisaniye: { en: 0, ek: 0, ornek: 'milisaniye()', cpp: () => 'millis()' },
  mikrosaniye: { en: 0, ek: 0, ornek: 'mikrosaniye()', cpp: () => 'micros()' },
  seri_baslat: { en: 0, ek: 1, ornek: 'seri_başlat(9600)', cpp: (a) => `Serial.begin(${a[0] ?? 9600})` },
  seri_hazir: { en: 0, ek: 0, ornek: 'seri_hazır()', cpp: () => 'Serial.available()' },
  seri_oku: { en: 0, ek: 0, ornek: 'seri_oku()', cpp: () => 'Serial.read()' },
  seri_sayi_oku: { en: 0, ek: 0, ornek: 'seri_sayı_oku()', cpp: () => 'Serial.parseInt()' },
  ses: { en: 2, ek: 3, ornek: 'ses(8, 440, 200)', cpp: (a) => `tone(${a.join(', ')})` },
  sustur: { en: 1, ek: 1, ornek: 'sustur(8)', cpp: (a) => `noTone(${a[0]})` },
  darbe_oku: { en: 2, ek: 3, ornek: 'darbe_oku(7, YÜKSEK)', cpp: (a) => `pulseIn(${a.join(', ')})` },
  esle: { en: 5, ek: 5, ornek: 'eşle(x, 0, 1023, 0, 255)', cpp: (a) => `map(${a.join(', ')})` },
  sinirla: { en: 3, ek: 3, ornek: 'sınırla(x, 0, 255)', cpp: (a) => `constrain(${a.join(', ')})` },
  rastgele: { en: 1, ek: 2, ornek: 'rastgele(1, 7)', cpp: (a) => `random(${a.join(', ')})` },
  mutlak: { en: 1, ek: 1, ornek: 'mutlak(x)', cpp: (a) => `abs(${a[0]})` },
  en_kucuk: { en: 2, ek: 2, ornek: 'en_küçük(a, b)', cpp: (a) => `min(${a[0]}, ${a[1]})` },
  en_buyuk: { en: 2, ek: 2, ornek: 'en_büyük(a, b)', cpp: (a) => `max(${a[0]}, ${a[1]})` },
  karekok: { en: 1, ek: 1, ornek: 'karekök(x)', cpp: (a) => `sqrt(${a[0]})` },
  us: { en: 2, ek: 2, ornek: 'üs(2, 8)', cpp: (a) => `pow(${a[0]}, ${a[1]})` },
  sayi_degil_mi: { en: 1, ek: 1, ornek: 'sayı_değil_mi(s)', cpp: (a) => `isnan(${a[0]})` },
  // yaz: değerleri yan yana yazar, sonra alt satıra geçer. Sabit metinler F()
  // ile flash'ta tutulur, 2 KB RAM'den yemez.
  yaz: { en: 0, ek: 99, ornek: 'yaz("Sıcaklık: ", s)', yazdir: true, cpp: (a) => seriYaz(a, true) },
  yaz_satirsiz: { en: 1, ek: 99, ornek: 'yaz_satırsız("x = ")', yazdir: true, cpp: (a) => seriYaz(a, false) },
};

function seriYaz(args, satir) {
  if (!args.length) return ['Serial.println()'];
  return args.map((a, i) => `Serial.${satir && i === args.length - 1 ? 'println' : 'print'}(${a})`);
}

// Hazır işlevlerin listesi (editörde otomatik tamamlama için).
export const HAZIR_ISLEVLER = Object.values(HAZIR).map((h) => h.ornek);

const ONCELIK = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

// nesneler: Devre sekmesindeki nesneler { ad: c++ tipi } (libraries.js devreNesneleri)
export function uret(ast, { dosya = 'program.stf', baslik = [], nesneler = {} } = {}) {
  const satirlar = [];
  let eslenen = null; // sıradaki C++ satırının karşılık geldiği .stf satırı
  const dosyaAdi = dosya.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const yaz = (kaynakSatir, metin, girinti = 0) => {
    if (kaynakSatir != null && kaynakSatir !== eslenen) {
      satirlar.push(`#line ${kaynakSatir} "${dosyaAdi}"`);
      eslenen = kaynakSatir;
    }
    satirlar.push('  '.repeat(girinti) + metin);
    if (eslenen != null) eslenen++;
  };

  // Kullanıcının tanımladığı tüm adlar: C++ ile çakışanlar yeniden adlandırılır.
  const tanimli = new Set();
  const islevler = new Map();
  // Nesne adı -> C++ tipi; metotların Türkçe adlarını çevirmek için.
  const nesneTipi = new Map(Object.entries({ ...HAZIR_NESNELER, ...nesneler }).map(([k, v]) => [asciiYap(k), v]));
  const kullanilan = new Set(); // kodda geçen adlar (EEPROM, Wire... başlıkları için)
  topla(ast.govde);
  function topla(govde) {
    for (const k of govde) {
      if (k.tur === 'degisken') tanimli.add(asciiYap(k.ad));
      if (k.tur === 'nesne') {
        tanimli.add(asciiYap(k.ad));
        nesneTipi.set(asciiYap(k.ad), nesneTipiBul(k).cpp);
      }
      if (k.tur === 'islev') {
        tanimli.add(asciiYap(k.ad));
        islevler.set(asciiYap(k.ad), k);
        for (const p of k.parametreler) tanimli.add(asciiYap(p.ad));
      }
      if (k.tur === 'her') tanimli.add(asciiYap(k.ad));
      for (const alt of [k.govde, k.degilse, ...(k.dallar ?? []).map((d) => d.govde)]) if (alt) topla(alt);
    }
  }
  const ad = (s) => {
    const a = asciiYap(s);
    return tanimli.has(a) && AYRILMIS.has(a) ? `${a}_` : a;
  };

  // --- İfadeler ---
  const ifd = (e) => {
    switch (e.tur) {
      case 'sayi': return e.deger;
      case 'metin': return `"${e.deger}"`;
      case 'parantez': return `(${ifd(e.ifade)})`;
      case 'ad': {
        const a = asciiYap(e.ad);
        kullanilan.add(a);
        if (!tanimli.has(a) && SABITLER[a]) return SABITLER[a];
        return ad(e.ad);
      }
      case 'tekli': {
        const ic = ifd(e.deger);
        return e.deger.tur === 'ikili' ? `${e.op}(${ic})` : `${e.op}${ic}`;
      }
      case 'ikili': {
        const p = ONCELIK[e.op];
        const parca = (x, sag) => {
          let s = ifd(x);
          if (x.tur === 'ikili' && (ONCELIK[x.op] < p || (sag && ONCELIK[x.op] === p))) s = `(${s})`;
          // "Sıcaklık: " + s  ->  String("Sıcaklık: ") + s (C'de iki metin + ile toplanamaz)
          if (e.op === '+' && x.tur === 'metin') s = `String(${s})`;
          return s;
        };
        return `${parca(e.sol, false)} ${e.op} ${parca(e.sag, true)}`;
      }
      case 'indis': return `${ifd(e.nesne)}[${ifd(e.indis)}]`;
      case 'uye': return `${ifd(e.nesne)}.${asciiYap(e.ad)}`;
      case 'cagri': {
        const h = hazir(e);
        if (h) {
          const r = h.cpp(argumanlar(e, h));
          return Array.isArray(r) ? (r.length === 1 ? r[0] : `(${r.join(', ')})`) : r;
        }
        if (e.fonk.tur === 'uye') return metotCagrisi(e);
        return `${ifd(e.fonk)}(${e.argumanlar.map(ifd).join(', ')})`;
      }
      default: throw new Error(`bilinmeyen ifade: ${e.tur}`);
    }
  };

  // ekran.yaz("Merhaba") -> ekran.print(F("Merhaba")), kol.açı(90) -> kol.write(90)
  function metotCagrisi(e) {
    const { nesne, ad: metot } = e.fonk;
    const tip = nesne.tur === 'ad' ? nesneTipi.get(asciiYap(nesne.ad)) : null;
    const asil = yontemBul(tip, metot, asciiYap) ?? asciiYap(metot);
    const args = e.argumanlar.map((x) => (YAZDIRMA.has(asil) && x.tur === 'metin' ? `F(${ifd(x)})` : ifd(x)));
    return `${ifd(nesne)}.${asil}(${args.join(', ')})`;
  }

  function nesneTipiBul(k) {
    return harfsizBul(NESNE_TIPLERI, k.tip, asciiYap) ?? { cpp: asciiYap(k.tip), basliklar: [] };
  }

  function hazir(e) {
    if (e.fonk.tur !== 'ad') return null;
    const a = asciiYap(e.fonk.ad);
    if (islevler.has(a) || !Object.hasOwn(HAZIR, a)) return null;
    const h = HAZIR[a];
    const n = e.argumanlar.length;
    if (n < h.en || n > h.ek) {
      const beklenen = h.en === h.ek ? `${h.en}` : h.ek === 99 ? `en az ${h.en}` : `${h.en} ya da ${h.ek}`;
      throw new StfHatasi(`${e.fonk.ad} ${beklenen} değer alır, ${n} verildi. Örnek: ${h.ornek}`, e.fonk.line, e.fonk.col);
    }
    return h;
  }

  function argumanlar(e, h) {
    return e.argumanlar.map((x) => (h.yazdir && x.tur === 'metin' ? `F(${ifd(x)})` : ifd(x)));
  }

  // --- Komutlar ---
  const durum = { islev: null, dongu: 0, sayac: 0 };

  const blok = (govde, g) => {
    for (const k of govde) komut(k, g);
  };

  function komut(k, g) {
    switch (k.tur) {
      case 'degisken':
        yaz(k.line, `${degiskenTanimi(k)};`, g);
        return;
      case 'atama':
        yaz(k.line, `${ifd(k.hedef)} ${k.op} ${ifd(k.deger)};`, g);
        return;
      case 'artir':
        yaz(k.line, `${ifd(k.hedef)}${k.op};`, g);
        return;
      case 'ifade': {
        const h = hazir(k.ifade);
        if (h) {
          const r = h.cpp(argumanlar(k.ifade, h));
          yaz(k.line, (Array.isArray(r) ? r : [r]).map((s) => `${s};`).join(' '), g);
        } else {
          yaz(k.line, `${ifd(k.ifade)};`, g);
        }
        return;
      }
      case 'dondur': {
        const f = durum.islev;
        if (!f) {
          if (k.deger) throw new StfHatasi('"döndür" ile değer sadece işlevlerde döndürülebilir.', k.line, 1);
          yaz(k.line, 'return;', g);
          return;
        }
        if (k.deger && !f.donus) throw new StfHatasi(`"${f.ad}" işlevi değer döndürmüyor. Değer döndürmesi için tipini yaz: işlev ${f.ad}(...) sayı`, k.line, 1);
        if (!k.deger && f.donus) throw new StfHatasi(`"${f.ad}" işlevi bir ${f.donus} döndürmeli: döndür <değer>`, k.line, 1);
        yaz(k.line, k.deger ? `return ${ifd(k.deger)};` : 'return;', g);
        return;
      }
      case 'kir':
      case 'atla':
        if (!durum.dongu) throw new StfHatasi(`"${k.tur === 'kir' ? 'kır' : 'atla'}" sadece bir tekrarla bloğunun içinde kullanılabilir.`, k.line, 1);
        yaz(k.line, k.tur === 'kir' ? 'break;' : 'continue;', g);
        return;
      case 'eger':
        k.dallar.forEach((d, i) => {
          yaz(d.line, `${i ? '} else if' : 'if'} (${ifd(d.kosul)}) {`, g);
          blok(d.govde, g + 1);
        });
        if (k.degilse) {
          yaz(k.degilseLine, '} else {', g);
          blok(k.degilse, g + 1);
        }
        yaz(k.sonLine, '}', g);
        return;
      case 'iken':
        dongu(k, g, `while (${ifd(k.kosul)}) {`);
        return;
      case 'surekli':
        dongu(k, g, 'while (true) {');
        return;
      case 'kez': {
        const i = `_tekrar${++durum.sayac}`;
        dongu(k, g, `for (int ${i} = 0; ${i} < ${ifd(k.sayi)}; ${i}++) {`);
        return;
      }
      case 'her': {
        const v = ad(k.ad);
        const bas = ifd(k.baslangic);
        const bit = ifd(k.bitis);
        let artis;
        let kosul;
        const sabitSayi = (x) => (x.tur === 'sayi' ? Number(x.deger) : x.tur === 'tekli' && x.deger.tur === 'sayi' ? Number(`${x.op}${x.deger.deger}`) : null);
        if (k.adim) {
          const s = sabitSayi(k.adim);
          const a = ifd(k.adim);
          artis = `${v} += ${a}`;
          if (s === 0) throw new StfHatasi('"adım" 0 olamaz, döngü hiç bitmez.', k.line, 1);
          kosul = s == null ? `(${a} > 0 ? ${v} <= ${bit} : ${v} >= ${bit})` : s > 0 ? `${v} <= ${bit}` : `${v} >= ${bit}`;
        } else {
          const b1 = sabitSayi(k.baslangic);
          const b2 = sabitSayi(k.bitis);
          const geri = b1 != null && b2 != null && b1 > b2;
          artis = geri ? `${v}--` : `${v}++`;
          kosul = geri ? `${v} >= ${bit}` : `${v} <= ${bit}`;
        }
        dongu(k, g, `for (int ${v} = ${bas}; ${kosul}; ${artis}) {`);
        return;
      }
      default:
        throw new Error(`bilinmeyen komut: ${k.tur}`);
    }
  }

  function dongu(k, g, bas) {
    yaz(k.line, bas, g);
    durum.dongu++;
    blok(k.govde, g + 1);
    durum.dongu--;
    yaz(k.sonLine, '}', g);
  }

  function degiskenTanimi(k) {
    let s = `${k.sabit ? 'const ' : ''}${TIP_CPP[k.tip]} ${ad(k.ad)}`;
    if (k.dizi) s += `[${k.dizi.boyut ? ifd(k.dizi.boyut) : ''}]`;
    if (k.ilk) s += k.ilk.tur === 'liste' ? ` = {${k.ilk.ogeler.map(ifd).join(', ')}}` : ` = ${ifd(k.ilk)}`;
    return s;
  }

  const imza = (f) => `${f.donus ? TIP_CPP[f.donus] : 'void'} ${ad(f.ad)}(${f.parametreler.map((p) => `${TIP_CPP[p.tip]} ${ad(p.ad)}`).join(', ')})`;

  // --- Program ---
  const kurlar = ast.govde.filter((k) => k.tur === 'kur');
  const donguler = ast.govde.filter((k) => k.tur === 'dongu');
  if (kurlar.length > 1) throw new StfHatasi('Programda bir tane "kur" bloğu olabilir.', kurlar[1].line, 1);
  if (donguler.length > 1) throw new StfHatasi('Programda bir tane "döngü" bloğu olabilir.', donguler[1].line, 1);
  const goruldu = new Set();
  for (const f of islevler.values()) {
    if (goruldu.has(asciiYap(f.ad))) throw new StfHatasi(`"${f.ad}" adında iki işlev var.`, f.line, 1);
    goruldu.add(asciiYap(f.ad));
  }

  // Kütüphane başlıkları: "kütüphane" satırları, "nesne" tipleri ve kullanılan hazır nesneler.
  const basliklar = [];
  const baslikEkle = (h) => {
    if (!basliklar.includes(h)) basliklar.push(h);
  };
  for (const k of ast.govde) {
    if (k.tur === 'kutuphane') {
      if (k.metin) baslikEkle(k.ad);
      else {
        const bilinen = harfsizBul(KUTUPHANE_ADLARI, k.ad, asciiYap);
        if (!bilinen) {
          throw new StfHatasi(`"${k.ad}" diye bir kütüphane bilinmiyor. Bilinenler: ${Object.keys(KUTUPHANE_ADLARI).join(', ')}. Başka bir kütüphane için başlık dosyasını tırnakla yaz: kütüphane "Kutuphane.h"`, k.line, k.col);
        }
        bilinen.forEach(baslikEkle);
      }
    }
    if (k.tur === 'nesne') nesneTipiBul(k).basliklar.forEach(baslikEkle);
  }
  // Kodun tamamı üretilmeden hangi adların kullanıldığı bilinmez; başlıklar
  // sonradan, taslağın en üstüne eklenir (satır eşlemesini bozmaz: #line var).
  const baslikYeri = satirlar.length;

  for (const s of baslik) yaz(null, s);
  // İşlevler tanımlanmadan önce de çağrılabilsin diye önce imzaları yazılır.
  if (islevler.size) {
    for (const f of ast.govde.filter((k) => k.tur === 'islev')) yaz(null, `${imza(f)};`);
    yaz(null, '');
  }

  for (const k of ast.govde) {
    if (k.tur === 'degisken') {
      yaz(k.line, `${degiskenTanimi(k)};`);
    } else if (k.tur === 'nesne') {
      const t = nesneTipiBul(k);
      const args = k.argumanlar.map((a, i) => (t.adresle?.includes(i) && a.tur === 'ad' ? `&${ifd(a)}` : ifd(a)));
      yaz(k.line, `${t.cpp} ${ad(k.ad)}${args.length ? `(${args.join(', ')})` : ''};`);
    } else if (k.tur === 'kur' || k.tur === 'dongu') {
      yaz(k.line, `void ${k.tur === 'kur' ? 'setup' : 'loop'}() {`);
      if (k.tur === 'kur') yaz(null, 'stfkartBegin();', 1);
      durum.islev = null;
      blok(k.govde, 1);
      yaz(k.sonLine, '}');
    } else if (k.tur === 'islev') {
      durum.islev = k;
      yaz(k.line, `${imza(k)} {`);
      blok(k.govde, 1);
      yaz(k.sonLine, '}');
      durum.islev = null;
    }
  }
  // kur veya döngü yazılmamışsa boş olarak eklenir; Arduino ikisini de ister.
  if (!kurlar.length) {
    eslenen = -1;
    satirlar.push('', 'void setup() {', '  stfkartBegin();', '}');
  }
  if (!donguler.length) satirlar.push('', 'void loop() {', '}');
  if (kullanilan.has('EEPROM')) baslikEkle('EEPROM.h');
  if (kullanilan.has('Wire')) baslikEkle('Wire.h');
  if (kullanilan.has('SPI')) baslikEkle('SPI.h');
  // #include'lar Arduino.h'den sonra, ilk boş satırdan önce gelir.
  const bos = satirlar.indexOf('', baslikYeri);
  satirlar.splice(bos < 0 ? baslikYeri + baslik.length : bos, 0, ...basliklar.map((h) => `#include <${h}>`));
  return `${satirlar.join('\n')}\n`;
}
