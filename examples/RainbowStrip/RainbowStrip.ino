// Runs a rainbow along an 8-LED NeoPixel strip on D6.

void setup() {
  stfkartBegin();
  strip.setBrightness(40);  // 0-255; keep it low when powered from USB
}

void loop() {
  static uint16_t hue = 0;
  for (uint16_t i = 0; i < strip.numPixels(); i++) {
    uint16_t pixelHue = hue + i * 65536UL / strip.numPixels();
    strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue)));
  }
  strip.show();
  hue += 256;
  delay(20);
}
