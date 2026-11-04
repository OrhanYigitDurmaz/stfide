// STF dili: ayrıştırıcı (parser). Token listesinden sözdizimi ağacı (AST)
// kurar. Elle yazılmış "recursive descent" ayrıştırıcıdır: dilbilgisinin her
// kuralı aşağıda bir fonksiyon.
//
//   program   := { üst_öğe satır }
//   üst_öğe   := "kur" blok "son" | "döngü" blok "son" | işlev | değişken
//   işlev     := "işlev" AD "(" [tip AD {"," tip AD}] ")" [tip] blok "son"
//   değişken  := ["sabit"] tip AD ["[" [ifade] "]"] ["=" (ifade | "[" ifadeler "]")]
//   komut     := değişken | eğer | iken | kez | her | sürekli | "döndür" [ifade]
//              | "kır" | "atla" | atama | ifade
//   eğer      := "eğer" ifade "ise" blok {"değilse" "eğer" ifade "ise" blok} ["değilse" blok] "son"
//   iken      := "iken" ifade "tekrarla" blok "son"
//   kez       := ifade "kez" "tekrarla" blok "son"
//   her       := "her" AD "için" ifade EK ifade EK "kadar" ["adım" ifade] ["tekrarla"] blok "son"
//   sürekli   := "sürekli" "tekrarla" blok "son"
//
// İfade öncelikleri (düşükten yükseğe): veya, ve, değil, karşılaştırma,
// + -, * / %, tekli -, çağrı/indis/üye.

import { StfHatasi } from './errors.js';

export const TIPLER = ['sayı', 'uzun', 'ondalık', 'metin', 'mantık', 'bayt'];
const KARSILASTIRMA = ['==', '!=', '<', '>', '<=', '>='];
const ATAMA = ['=', '+=', '-=', '*=', '/=', '%='];
const DEN_EKLERI = ['den', 'dan', 'ten', 'tan'];
const A_EKLERI = ['a', 'e', 'ya', 'ye', 'na', 'ne'];

export function ayristir(tokens) {
  let p = 0;
  const bak = (k = 0) => tokens[p + k];
  const al = () => tokens[p++];
  const anahtarMi = (v, t = bak()) => t.type === 'anahtar' && t.value === v;
  const isaretMi = (v, t = bak()) => t.type === 'isaret' && t.value === v;
  const tipMi = (t = bak()) => t.type === 'anahtar' && TIPLER.includes(t.value);

  const goster = (t) => {
    if (t.type === 'satir') return 'satır sonu';
    if (t.type === 'son') return 'dosyanın sonu';
    if (t.type === 'metin') return `"${t.value}"`;
    if (t.type === 'ek') return `'${t.value}`;
    return `"${t.value}"`;
  };
  const hata = (mesaj, t = bak()) => new StfHatasi(mesaj, t.line, t.col);
  const bekle = (tur, deger, aciklama) => {
    const t = bak();
    if (t.type === tur && (deger === undefined || t.value === deger)) return al();
    throw hata(`${aciklama} bekleniyordu, ${goster(t)} bulundu.`);
  };
  const anahtarBekle = (v, aciklama = `"${v}"`) => bekle('anahtar', v, aciklama);
  const adBekle = (ne = 'Bir ad') => {
    const t = bak();
    if (t.type === 'ad') return al();
    if (t.type === 'anahtar') throw hata(`"${t.value}" bir anahtar kelime, ad olarak kullanılamaz. Başka bir ad seç.`);
    throw hata(`${ne} bekleniyordu, ${goster(t)} bulundu.`);
  };
  const satirlariAtla = () => {
    while (bak().type === 'satir') al();
  };
  const satirSonu = () => {
    const t = bak();
    if (t.type === 'satir') {
      al();
      return;
    }
    if (t.type === 'son' || anahtarMi('son') || anahtarMi('değilse')) return;
    throw hata(`Bu satırda fazladan ${goster(t)} var. Her komut kendi satırında olmalı.`);
  };

  // --- Üst seviye -------------------------------------------------------
  function program() {
    const govde = [];
    satirlariAtla();
    while (bak().type !== 'son') {
      govde.push(ustOge());
      satirSonu();
      satirlariAtla();
    }
    return { tur: 'program', govde };
  }

  function ustOge() {
    const t = bak();
    if (anahtarMi('kur') || anahtarMi('döngü')) {
      al();
      const govde = blok(t);
      const son = anahtarBekle('son', `"${t.value}" bloğunu kapatan "son"`);
      return { tur: t.value === 'kur' ? 'kur' : 'dongu', govde, line: t.line, sonLine: son.line };
    }
    if (anahtarMi('işlev')) return islev();
    if (anahtarMi('sabit') || tipMi()) return degisken();
    if (anahtarMi('son')) throw hata('Fazladan "son": kapatacak bir blok yok.');
    throw hata(`Burada ${goster(t)} olamaz. En dışta sadece "kur", "döngü", "işlev" ve değişken tanımları olabilir; komutları "kur" ya da "döngü" içine yaz.`);
  }

  function islev() {
    const bas = al();
    const ad = adBekle('İşlevin adı');
    bekle('isaret', '(', '"("');
    const parametreler = [];
    if (!isaretMi(')')) {
      do {
        if (!tipMi()) throw hata(`Parametrenin tipi bekleniyordu (${TIPLER.join(', ')}), ${goster(bak())} bulundu.`);
        const tip = al().value;
        const pad = adBekle('Parametrenin adı');
        parametreler.push({ tip, ad: pad.value });
      } while (isaretMi(',') && al());
    }
    bekle('isaret', ')', '")"');
    let donus = null;
    if (tipMi()) donus = al().value;
    const govde = blok(bas);
    const son = anahtarBekle('son', `"${ad.value}" işlevini kapatan "son"`);
    return { tur: 'islev', ad: ad.value, parametreler, donus, govde, line: bas.line, sonLine: son.line };
  }

  function degisken() {
    const bas = bak();
    const sabit = anahtarMi('sabit') ? Boolean(al()) : false;
    if (!tipMi()) throw hata(`"sabit"ten sonra tip bekleniyordu (${TIPLER.join(', ')}), ${goster(bak())} bulundu.`);
    const tip = al().value;
    const ad = adBekle('Değişkenin adı');
    let dizi = null;
    if (isaretMi('[')) {
      al();
      dizi = { boyut: isaretMi(']') ? null : ifade() };
      bekle('isaret', ']', '"]"');
    }
    let ilk = null;
    if (isaretMi('=')) {
      al();
      if (isaretMi('[')) {
        if (!dizi) throw hata('Liste sadece dizilere verilebilir. Örnek: sayı notalar[] = [262, 294, 330]');
        const lt = al();
        const ogeler = [];
        satirlariAtla();
        if (!isaretMi(']')) {
          do {
            satirlariAtla();
            ogeler.push(ifade());
            satirlariAtla();
          } while (isaretMi(',') && al());
        }
        bekle('isaret', ']', '"]"');
        ilk = { tur: 'liste', ogeler, line: lt.line };
      } else {
        ilk = ifade();
      }
    } else if (isaretMi('==')) {
      throw hata('Değer vermek için tek = kullan.');
    }
    if (dizi && !dizi.boyut && !ilk) throw hata('Dizinin boyutunu yaz ya da liste ver. Örnek: sayı dizi[5]');
    if (sabit && !ilk) throw hata('Sabitlere hemen bir değer verilmeli. Örnek: sabit sayı LED = 13');
    return { tur: 'degisken', sabit, tip, ad: ad.value, dizi, ilk, line: bas.line };
  }

  // --- Bloklar ve komutlar ---------------------------------------------
  // Bir blok, "son" veya "değilse" görülene kadar süren komutlardır.
  function blok(acan) {
    const govde = [];
    satirlariAtla();
    for (;;) {
      const t = bak();
      if (anahtarMi('son') || anahtarMi('değilse')) return govde;
      if (t.type === 'son') {
        throw new StfHatasi(`${acan.line}. satırdaki "${acan.value}" bloğu kapanmamış: sonuna "son" ekle.`, acan.line, acan.col);
      }
      govde.push(komut());
      satirSonu();
      satirlariAtla();
    }
  }

  function komut() {
    const t = bak();
    if (t.type === 'anahtar') {
      switch (t.value) {
        case 'sabit': return degisken();
        case 'eğer': return eger();
        case 'iken': return iken();
        case 'her': return her();
        case 'sürekli': {
          al();
          anahtarBekle('tekrarla', '"sürekli"den sonra "tekrarla"');
          const govde = blok(t);
          const son = anahtarBekle('son', '"sürekli tekrarla" bloğunu kapatan "son"');
          return { tur: 'surekli', govde, line: t.line, sonLine: son.line };
        }
        case 'döndür': {
          al();
          const bitti = bak().type === 'satir' || bak().type === 'son' || anahtarMi('son');
          return { tur: 'dondur', deger: bitti ? null : ifade(), line: t.line };
        }
        case 'kır': al(); return { tur: 'kir', line: t.line };
        case 'atla': al(); return { tur: 'atla', line: t.line };
        case 'kur':
        case 'döngü':
        case 'işlev':
          throw hata(`"${t.value}" bir bloğun içinde olamaz. Önceki bloğu "son" ile kapatmayı unuttun mu?`);
        default:
          if (TIPLER.includes(t.value)) return degisken();
      }
    }
    // Atama, x++ veya "N kez tekrarla" ya da tek başına ifade (işlev çağrısı).
    const sol = ifade();
    const s = bak();
    if (anahtarMi('kez')) {
      al();
      anahtarBekle('tekrarla', '"kez"den sonra "tekrarla"');
      const govde = blok(t);
      const son = anahtarBekle('son', '"kez tekrarla" bloğunu kapatan "son"');
      return { tur: 'kez', sayi: sol, govde, line: t.line, sonLine: son.line };
    }
    if (s.type === 'isaret' && ATAMA.includes(s.value)) {
      atanabilirMi(sol, s);
      al();
      return { tur: 'atama', hedef: sol, op: s.value, deger: ifade(), line: t.line };
    }
    if (s.type === 'isaret' && (s.value === '++' || s.value === '--')) {
      atanabilirMi(sol, s);
      al();
      return { tur: 'artir', hedef: sol, op: s.value, line: t.line };
    }
    if (sol.tur !== 'cagri') {
      if (s.type === 'isaret' && s.value === '==') throw hata('Değer vermek için tek = kullan; == karşılaştırmadır.', s);
      throw hata('Bu satır bir şey yapmıyor. Bir değer mi vermek istedin (x = 5) yoksa bir işlev mi çağırmak (bekle(100))?', t);
    }
    return { tur: 'ifade', ifade: sol, line: t.line };
  }

  function atanabilirMi(ifd, t) {
    if (ifd.tur === 'ad' || ifd.tur === 'indis' || ifd.tur === 'uye') return;
    throw hata(`"${t.value}" işaretinin solunda bir değişken olmalı.`, t);
  }

  // Koşullarda sık yapılan = / == karışıklığını yakalar.
  function kosul() {
    const k = ifade();
    if (isaretMi('=')) throw hata('Karşılaştırmak için == kullan (tek = değer vermek içindir).');
    return k;
  }

  function eger() {
    const bas = al();
    const dallar = [];
    let kosulu = kosul();
    anahtarBekle('ise', 'Koşuldan sonra "ise"');
    dallar.push({ kosul: kosulu, govde: blok(bas), line: bas.line });
    let degilse = null;
    let degilseLine = null;
    while (anahtarMi('değilse')) {
      const d = al();
      if (anahtarMi('eğer')) {
        const e = al();
        kosulu = kosul();
        anahtarBekle('ise', 'Koşuldan sonra "ise"');
        dallar.push({ kosul: kosulu, govde: blok(e), line: d.line });
        continue;
      }
      degilseLine = d.line;
      degilse = blok(d);
      if (anahtarMi('değilse')) throw hata('"değilse" bir kez kullanılabilir. Başka koşul için "değilse eğer ... ise" yaz.');
    }
    const son = anahtarBekle('son', '"eğer" bloğunu kapatan "son"');
    return { tur: 'eger', dallar, degilse, degilseLine, line: bas.line, sonLine: son.line };
  }

  function iken() {
    const bas = al();
    const k = kosul();
    anahtarBekle('tekrarla', 'Koşuldan sonra "tekrarla"');
    const govde = blok(bas);
    const son = anahtarBekle('son', '"iken" bloğunu kapatan "son"');
    return { tur: 'iken', kosul: k, govde, line: bas.line, sonLine: son.line };
  }

  // her i için 1'den 10'a kadar [adım 2] [tekrarla] ... son
  function her() {
    const bas = al();
    const ad = adBekle('Sayaç değişkeninin adı');
    anahtarBekle('için', `"her ${ad.value}" sonrasında "için"`);
    const baslangic = ifade();
    ekBekle(DEN_EKLERI, "Başlangıç değerinden sonra 'den ekini (1'den gibi)");
    const bitis = ifade();
    ekBekle(A_EKLERI, "Bitiş değerinden sonra 'a ekini (10'a gibi)");
    anahtarBekle('kadar', '"kadar"');
    let adim = null;
    if (anahtarMi('adım')) {
      al();
      adim = ifade();
    }
    if (anahtarMi('tekrarla')) al();
    const govde = blok(bas);
    const son = anahtarBekle('son', '"her" bloğunu kapatan "son"');
    return { tur: 'her', ad: ad.value, baslangic, bitis, adim, govde, line: bas.line, sonLine: son.line };
  }

  function ekBekle(gecerli, aciklama) {
    const t = bak();
    if (t.type !== 'ek') throw hata(`${aciklama} bekleniyordu, ${goster(t)} bulundu.`);
    if (!gecerli.includes(asciiKucuk(t.value))) throw hata(`'${t.value} eki burada olmaz; '${gecerli.join(", '")} eklerinden biri olmalı.`);
    return al();
  }

  // --- İfadeler ---------------------------------------------------------
  function ifade() {
    return veya();
  }

  function veya() {
    let sol = ve();
    while (anahtarMi('veya')) {
      al();
      sol = { tur: 'ikili', op: '||', sol, sag: ve() };
    }
    return sol;
  }

  function ve() {
    let sol = degil();
    while (anahtarMi('ve')) {
      al();
      sol = { tur: 'ikili', op: '&&', sol, sag: degil() };
    }
    return sol;
  }

  function degil() {
    if (anahtarMi('değil')) {
      al();
      return { tur: 'tekli', op: '!', deger: degil() };
    }
    return karsilastirma();
  }

  function karsilastirma() {
    let sol = toplama();
    while (bak().type === 'isaret' && KARSILASTIRMA.includes(bak().value)) {
      const op = al().value;
      sol = { tur: 'ikili', op, sol, sag: toplama() };
    }
    return sol;
  }

  function toplama() {
    let sol = carpma();
    while (isaretMi('+') || isaretMi('-')) {
      const op = al().value;
      sol = { tur: 'ikili', op, sol, sag: carpma() };
    }
    return sol;
  }

  function carpma() {
    let sol = tekli();
    while (isaretMi('*') || isaretMi('/') || isaretMi('%')) {
      const op = al().value;
      sol = { tur: 'ikili', op, sol, sag: tekli() };
    }
    return sol;
  }

  function tekli() {
    if (isaretMi('-') || isaretMi('+')) {
      const op = al().value;
      return { tur: 'tekli', op, deger: tekli() };
    }
    return sonek();
  }

  function sonek() {
    let ifd = birincil();
    for (;;) {
      if (isaretMi('(')) {
        al();
        const argumanlar = [];
        if (!isaretMi(')')) {
          do argumanlar.push(ifade());
          while (isaretMi(',') && al());
        }
        bekle('isaret', ')', '")"');
        ifd = { tur: 'cagri', fonk: ifd, argumanlar };
      } else if (isaretMi('[')) {
        al();
        const indis = ifade();
        bekle('isaret', ']', '"]"');
        ifd = { tur: 'indis', nesne: ifd, indis };
      } else if (isaretMi('.')) {
        al();
        const ad = adBekle('Noktadan sonra bir ad');
        ifd = { tur: 'uye', nesne: ifd, ad: ad.value };
      } else {
        return ifd;
      }
    }
  }

  function birincil() {
    const t = bak();
    if (t.type === 'sayi') {
      al();
      return { tur: 'sayi', deger: t.value };
    }
    if (t.type === 'metin') {
      al();
      return { tur: 'metin', deger: t.value };
    }
    if (t.type === 'ad') {
      al();
      return { tur: 'ad', ad: t.value, line: t.line, col: t.col };
    }
    if (isaretMi('(')) {
      al();
      const ic = ifade();
      bekle('isaret', ')', '")"');
      return { tur: 'parantez', ifade: ic };
    }
    if (t.type === 'anahtar') {
      if (t.value === 'ise') throw hata('"ise"den önce bir koşul olmalı.');
      throw hata(`"${t.value}" burada kullanılamaz; bir değer ya da değişken bekleniyordu.`);
    }
    if (t.type === 'satir' || t.type === 'son') throw hata('Satır yarım kalmış: burada bir değer bekleniyordu.');
    throw hata(`Bir değer bekleniyordu, ${goster(t)} bulundu.`);
  }

  return program();
}

function asciiKucuk(s) {
  return s.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]);
}
