// Counts button presses on D2 with an interrupt and prints the count.

volatile unsigned int presses = 0;  // changed inside the interrupt
unsigned int shown = 0;

void setup() {
  stfkartBegin();
  Serial.println("Press the button on D2");
}

void loop() {
  if (presses != shown) {
    shown = presses;
    Serial.print("Presses: ");
    Serial.println(shown);
  }
}

// Runs every time D2 goes LOW. Keep it short.
void onCounterButton() {
  static unsigned long last = 0;
  if (millis() - last > 50) {  // ignore switch bounce
    presses++;
  }
  last = millis();
}
