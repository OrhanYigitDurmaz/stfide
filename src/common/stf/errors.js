// STF dili hataları: satır ve sütun numarası taşır, mesajlar Türkçe.

export class StfHatasi extends Error {
  constructor(mesaj, line, col) {
    super(mesaj);
    this.name = 'StfHatasi';
    this.line = line;
    this.col = col;
  }
}
