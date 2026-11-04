// STF dili: Arduino kütüphanelerinin Türkçe karşılıkları.
//
// Her C++ tipi için Türkçe metot adı -> asıl metot adı tablosu. Adlar Türkçe
// harfsiz biçimde (asciiYap) karşılaştırılır; "ekran.imleç(0, 1)" ve
// "ekran.imlec(0, 1)" ikisi de setCursor olur. Tabloda olmayan metotlar
// (İngilizce adlar) olduğu gibi geçer, yani kütüphanenin her özelliği yine
// kullanılabilir.

import { COMPONENTS } from '../components.js';
import { resolve } from '../pins.js';

// Serial, SoftwareSerial gibi "akış" nesneleri
const AKIS = {
  'başlat': 'begin', yaz: 'print', 'satır_yaz': 'println', oku: 'read', 'hazır': 'available',
  'sayı_oku': 'parseInt', 'ondalık_oku': 'parseFloat', 'gönder': 'write', 'bekle_gönder': 'flush',
};

// Tip -> { türkçe: c++ }. Anahtarlar Türkçe yazılır; karşılaştırma harfsiz
// biçimle yapılır (yontemBul).
export const YONTEMLER = {
  LiquidCrystal_I2C: {
    'başlat': 'init', yaz: 'print', temizle: 'clear', 'imleç': 'setCursor', 'başa_dön': 'home',
    'ışık_aç': 'backlight', 'ışık_kapat': 'noBacklight', 'göster': 'display', gizle: 'noDisplay',
    'imleci_göster': 'cursor', imleci_gizle: 'noCursor', 'yanıp_sön': 'blink', 'yanıp_sönme': 'noBlink',
    'sola_kaydır': 'scrollDisplayLeft', 'sağa_kaydır': 'scrollDisplayRight',
  },
  Servo: {
    'bağla': 'attach', 'ayır': 'detach', 'açı': 'write', 'açı_oku': 'read', 'bağlı_mı': 'attached', mikrosaniye: 'writeMicroseconds',
  },
  DHT: { 'başlat': 'begin', 'sıcaklık_oku': 'readTemperature', nem_oku: 'readHumidity' },
  Adafruit_NeoPixel: {
    'başlat': 'begin', 'göster': 'show', temizle: 'clear', piksel: 'setPixelColor', renk: 'Color',
    'parlaklık': 'setBrightness', doldur: 'fill', 'piksel_sayısı': 'numPixels', renk_tonu: 'ColorHSV',
  },
  StfUltrasonic: { 'başlat': 'begin', mesafe_oku: 'readCm' },
  StfTempProbe: { 'başlat': 'begin', 'sıcaklık_oku': 'readC' },
  StfRgbLed: { 'başlat': 'begin', renk: 'color', kapat: 'off' },
  StfRelay: { 'başlat': 'begin', 'aç': 'on', kapat: 'off', 'değiştir': 'toggle', 'açık_mı': 'isOn' },
  OneWire: { 'sıfırla': 'reset', 'seç': 'select', atla: 'skip', 'gönder': 'write', oku: 'read', ara: 'search' },
  DallasTemperature: {
    'başlat': 'begin', 'ölç': 'requestTemperatures', 'sıcaklık_oku': 'getTempCByIndex', 'sensör_sayısı': 'getDeviceCount',
  },
  HardwareSerial: AKIS,
  SoftwareSerial: { ...AKIS, dinle: 'listen' },
  TwoWire: {
    'başlat': 'begin', 'iletim_başlat': 'beginTransmission', 'gönder': 'write', iletim_bitir: 'endTransmission',
    iste: 'requestFrom', oku: 'read', 'hazır': 'available', 'hız': 'setClock',
  },
  EEPROMClass: { oku: 'read', yaz: 'write', kaydet: 'update', uzunluk: 'length' },
  SPIClass: { 'başlat': 'begin', aktar: 'transfer', bitir: 'end' },
};

// Tipi bilinmeyen nesneler için ortak karşılıklar.
export const GENEL_YONTEMLER = { 'başlat': 'begin', yaz: 'print', 'satır_yaz': 'println', oku: 'read', 'hazır': 'available' };

const harfsiz = new Map();
// Bir nesne tipinde Türkçe metot adının asıl adı; yoksa null.
export function yontemBul(tip, ad, asciiYap) {
  return harfsizBul((tip && YONTEMLER[tip]) || GENEL_YONTEMLER, ad, asciiYap);
}

// Bu metotlara verilen sabit metinler F() ile sarılır (RAM yerine flash).
export const YAZDIRMA = new Set(['print', 'println']);

// Her taslakta hazır olan Arduino nesneleri.
export const HAZIR_NESNELER = { Serial: 'HardwareSerial', Wire: 'TwoWire', EEPROM: 'EEPROMClass', SPI: 'SPIClass' };

// "nesne <Tip> ad(...)" için tipler. Türkçe ad ya da asıl C++ adı yazılabilir.
//   cpp: C++ tipi, basliklar: eklenecek #include'lar, adresle: bu sıradaki
//   argümanlar & ile verilir (DallasTemperature(&tekTel) gibi).
export const NESNE_TIPLERI = {
  Servo: { cpp: 'Servo', basliklar: ['Servo.h'] },
  LcdEkran: { cpp: 'LiquidCrystal_I2C', basliklar: ['Wire.h', 'LiquidCrystal_I2C.h'] },
  DhtSensör: { cpp: 'DHT', basliklar: ['DHT.h'] },
  NeoPiksel: { cpp: 'Adafruit_NeoPixel', basliklar: ['Adafruit_NeoPixel.h'] },
  YazılımSeri: { cpp: 'SoftwareSerial', basliklar: ['SoftwareSerial.h'] },
  TekTel: { cpp: 'OneWire', basliklar: ['OneWire.h'] },
  SıcaklıkSensörleri: { cpp: 'DallasTemperature', basliklar: ['OneWire.h', 'DallasTemperature.h'], adresle: [0] },
};
for (const t of Object.values(NESNE_TIPLERI)) NESNE_TIPLERI[t.cpp] ??= t;

// Türkçe harfli ya da harfsiz yazılmış bir adı tabloda bulur.
export function harfsizBul(tablo, ad, asciiYap) {
  if (!harfsiz.has(tablo)) harfsiz.set(tablo, new Map(Object.entries(tablo).map(([k, v]) => [asciiYap(k).toLowerCase(), v])));
  return harfsiz.get(tablo).get(asciiYap(ad).toLowerCase()) ?? null;
}

// Kısa kütüphane adları: kütüphane lcd -> #include <LiquidCrystal_I2C.h>
export const KUTUPHANE_ADLARI = {
  servo: ['Servo.h'],
  lcd: ['Wire.h', 'LiquidCrystal_I2C.h'],
  dht: ['DHT.h'],
  neopiksel: ['Adafruit_NeoPixel.h'],
  yazılım_seri: ['SoftwareSerial.h'],
  tek_tel: ['OneWire.h'],
  sıcaklık_sensörleri: ['OneWire.h', 'DallasTemperature.h'],
  wire: ['Wire.h'],
  i2c: ['Wire.h'],
  spi: ['SPI.h'],
  eeprom: ['EEPROM.h'],
};

// Devre sekmesindeki parçaların ve servo pinlerinin nesneleri: { ad: c++ tipi }
export function devreNesneleri(config) {
  const out = {};
  if (!config) return out;
  try {
    config = resolve(config); // kablolardan pinleri ve parçaları çıkarır
  } catch {
    return out;
  }
  for (const [, p] of Object.entries(config?.pins ?? {})) {
    if (p?.role === 'servo' && p.name) out[p.name] = 'Servo';
  }
  for (const c of config?.components ?? []) {
    const def = COMPONENTS[c.type];
    const m = def && /^extern (\w+) /.exec(def.declare(c));
    if (m && c.name) out[c.name] = m[1];
  }
  return out;
}
