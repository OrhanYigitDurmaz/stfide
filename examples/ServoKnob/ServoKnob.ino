// Turns a servo on D9 to follow a potentiometer on A0.
#include "stfkart_pins.h"

void setup() {
  stfkartBegin();  // attaches the servo and moves it to 90°
}

void loop() {
  int value = analogRead(knob);            // 0..1023
  int angle = map(value, 0, 1023, 0, 180); // scale to 0..180 degrees
  arm.write(angle);
  delay(15);
}
