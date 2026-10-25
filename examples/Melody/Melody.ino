// Plays a short tune on a buzzer connected to D8.

const int notes[] = { 262, 294, 330, 349, 392, 440, 494, 523 };  // C4..C5
const int noteCount = sizeof(notes) / sizeof(notes[0]);

void setup() {
  stfkartBegin();
  for (int i = 0; i < noteCount; i++) {
    tone(buzzer, notes[i], 200);
    delay(250);
  }
  noTone(buzzer);
}

void loop() {
}
