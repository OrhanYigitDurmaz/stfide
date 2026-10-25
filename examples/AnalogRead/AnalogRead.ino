// Reads a potentiometer on A0 and prints the value to the Serial Monitor.

void setup() {
  stfkartBegin();  // also starts Serial at 9600 baud
}

void loop() {
  int value = analogRead(knob);              // 0..1023
  float volts = value * (5.0 / 1023.0);
  Serial.print("Value: ");
  Serial.print(value);
  Serial.print("  Voltage: ");
  Serial.println(volts);
  delay(200);
}
