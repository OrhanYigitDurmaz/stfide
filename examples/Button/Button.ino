// Turns the LED on while the button on D2 is held down.

void setup() {
  stfkartBegin();
}

void loop() {
  if (startButtonPressed()) {
    digitalWrite(led, HIGH);
  } else {
    digitalWrite(led, LOW);
  }
}
