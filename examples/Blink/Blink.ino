// Blinks the on-board LED once per second.

void setup() {
  stfkartBegin();  // sets up the pins from the Pins tab
}

void loop() {
  digitalWrite(led, HIGH);  // LED on
  delay(1000);              // wait one second
  digitalWrite(led, LOW);   // LED off
  delay(1000);
}
