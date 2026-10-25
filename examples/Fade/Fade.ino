// Fades an LED on D9 in and out with PWM.
#include "stfkart_pins.h"

int brightness = 0;
int step = 5;

void setup() {
  stfkartBegin();
}

void loop() {
  analogWrite(fadeLed, brightness);  // 0 = off, 255 = full brightness
  brightness = brightness + step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;  // reverse direction at either end
  }
  delay(30);
}
