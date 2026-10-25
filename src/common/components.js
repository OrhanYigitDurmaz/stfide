// Components: ready-made parts (sensors, displays, relays…) that can be
// added on the Pins tab. Each one claims pins, pulls in its library, and
// generates a named object so the user can write e.g. `distance.readCm()`.
//
// A component definition:
//   name, description      shown in the picker
//   prefix                 used to suggest an instance name
//   pins: [{ key, label, needs }]
//       needs: 'digital' | 'pwm' | 'interrupt' (any pin can do 'digital')
//   bus: 'i2c'             uses the I2C pins (A4/A5) instead of its own
//   options: [{ key, label, type: 'select'|'number', choices?, min?, max?, default }]
//   libraries              arduino-cli library specs, bundled by fetch-toolchain
//   includes               headers to include
//   helper                 name of a helper type defined in the generated code
//   declare(c)             extern declaration for the header
//   define(c, pin)         definition for the .cpp; pin(key) gives the pin expression
//   begin(c)               lines for stfkartBegin()
//   usage(c)               snippets shown on the Pins tab and in autocomplete

export const COMPONENTS = {
  ultrasonic: {
    name: 'Ultrasonic distance sensor (HC-SR04)',
    description: 'Measures distance from 2 cm to 4 m.',
    prefix: 'distance',
    pins: [
      { key: 'trig', label: 'Trig', needs: 'digital' },
      { key: 'echo', label: 'Echo', needs: 'digital' },
    ],
    helper: 'StfUltrasonic',
    declare: (c) => `extern StfUltrasonic ${c.name};`,
    define: (c, pin) => `StfUltrasonic ${c.name}(${pin('trig')}, ${pin('echo')});`,
    begin: (c) => [`${c.name}.begin();`],
    usage: (c) => [`float cm = ${c.name}.readCm();`],
  },

  dht: {
    name: 'Temperature & humidity sensor (DHT11/DHT22)',
    description: 'Reads air temperature (°C) and humidity (%).',
    prefix: 'climate',
    pins: [{ key: 'data', label: 'Data', needs: 'digital' }],
    options: [{ key: 'model', label: 'Model', type: 'select', choices: ['DHT11', 'DHT22'], default: 'DHT11' }],
    libraries: ['DHT sensor library@1.4.6', 'Adafruit Unified Sensor@1.1.14'],
    includes: ['DHT.h'],
    declare: (c) => `extern DHT ${c.name};`,
    define: (c, pin) => `DHT ${c.name}(${pin('data')}, ${c.options.model === 'DHT22' ? 'DHT22' : 'DHT11'});`,
    begin: (c) => [`${c.name}.begin();`],
    usage: (c) => [`float temperature = ${c.name}.readTemperature();`, `float humidity = ${c.name}.readHumidity();`],
  },

  ds18b20: {
    name: 'Waterproof temperature probe (DS18B20)',
    description: 'Accurate temperature probe on a single wire.',
    prefix: 'probe',
    pins: [{ key: 'data', label: 'Data', needs: 'digital' }],
    libraries: ['OneWire@2.3.8', 'DallasTemperature@4.0.4'],
    includes: ['OneWire.h', 'DallasTemperature.h'],
    helper: 'StfTempProbe',
    declare: (c) => `extern StfTempProbe ${c.name};`,
    define: (c, pin) => `StfTempProbe ${c.name}(${pin('data')});`,
    begin: (c) => [`${c.name}.begin();`],
    usage: (c) => [`float temperature = ${c.name}.readC();`],
  },

  lcd: {
    name: 'LCD display with I2C (16×2 / 20×4)',
    description: 'Character display on the I2C bus.',
    prefix: 'lcd',
    pins: [],
    bus: 'i2c',
    options: [
      { key: 'address', label: 'I2C address', type: 'select', choices: ['0x27', '0x3F'], default: '0x27' },
      { key: 'size', label: 'Size', type: 'select', choices: ['16x2', '20x4'], default: '16x2' },
    ],
    libraries: ['LiquidCrystal I2C@1.1.2'],
    includes: ['LiquidCrystal_I2C.h'],
    declare: (c) => `extern LiquidCrystal_I2C ${c.name};`,
    define: (c) => {
      const [cols, rows] = (c.options.size === '20x4' ? '20x4' : '16x2').split('x');
      const addr = c.options.address === '0x3F' ? '0x3F' : '0x27';
      return `LiquidCrystal_I2C ${c.name}(${addr}, ${cols}, ${rows});`;
    },
    begin: (c) => [`${c.name}.init();`, `${c.name}.backlight();`],
    usage: (c) => [`${c.name}.clear();`, `${c.name}.setCursor(0, 0);  // column, row\n${c.name}.print("Hello!");`],
  },

  neopixel: {
    name: 'RGB LED strip (NeoPixel / WS2812)',
    description: 'Addressable color LEDs on one data pin.',
    prefix: 'strip',
    pins: [{ key: 'data', label: 'Data', needs: 'digital' }],
    options: [{ key: 'count', label: 'Number of LEDs', type: 'number', min: 1, max: 300, default: 8 }],
    libraries: ['Adafruit NeoPixel@1.12.3'],
    includes: ['Adafruit_NeoPixel.h'],
    declare: (c) => `extern Adafruit_NeoPixel ${c.name};`,
    define: (c, pin) => `Adafruit_NeoPixel ${c.name}(${clampInt(c.options.count, 1, 300, 8)}, ${pin('data')}, NEO_GRB + NEO_KHZ800);`,
    begin: (c) => [`${c.name}.begin();`, `${c.name}.show();  // all off`],
    usage: (c) => [`${c.name}.setPixelColor(0, ${c.name}.Color(255, 0, 0));  // LED 0 red\n${c.name}.show();`],
  },

  rgbLed: {
    name: 'RGB LED',
    description: 'One LED that can show any color, on three PWM pins.',
    prefix: 'rgb',
    pins: [
      { key: 'red', label: 'Red', needs: 'pwm' },
      { key: 'green', label: 'Green', needs: 'pwm' },
      { key: 'blue', label: 'Blue', needs: 'pwm' },
    ],
    options: [{ key: 'type', label: 'Type', type: 'select', choices: ['Common cathode', 'Common anode'], default: 'Common cathode' }],
    helper: 'StfRgbLed',
    declare: (c) => `extern StfRgbLed ${c.name};`,
    define: (c, pin) => `StfRgbLed ${c.name}(${pin('red')}, ${pin('green')}, ${pin('blue')}, ${c.options.type === 'Common anode'});`,
    begin: (c) => [`${c.name}.begin();`],
    usage: (c) => [`${c.name}.color(255, 0, 255);  // red, green, blue (0-255)`, `${c.name}.off();`],
  },

  relay: {
    name: 'Relay module',
    description: 'Switches a motor, pump or lamp on and off.',
    prefix: 'relay',
    pins: [{ key: 'in', label: 'IN', needs: 'digital' }],
    options: [{ key: 'trigger', label: 'Turns on when IN is', type: 'select', choices: ['LOW', 'HIGH'], default: 'LOW' }],
    helper: 'StfRelay',
    declare: (c) => `extern StfRelay ${c.name};`,
    define: (c, pin) => `StfRelay ${c.name}(${pin('in')}, ${c.options.trigger === 'HIGH' ? 'HIGH' : 'LOW'});`,
    begin: (c) => [`${c.name}.begin();`],
    usage: (c) => [`${c.name}.on();`, `${c.name}.off();`],
  },
};

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// Small helper types used by components that need no external library.
// Each is emitted once, only when a component uses it.
export const HELPERS = {
  StfUltrasonic: {
    header: `class StfUltrasonic {
public:
  StfUltrasonic(uint8_t trig, uint8_t echo) : trig_(trig), echo_(echo) {}
  void begin();
  float readCm();  // distance in cm, or 0 when nothing is in range
private:
  uint8_t trig_, echo_;
};`,
    source: `void StfUltrasonic::begin() {
  pinMode(trig_, OUTPUT);
  digitalWrite(trig_, LOW);
  pinMode(echo_, INPUT);
}

float StfUltrasonic::readCm() {
  digitalWrite(trig_, LOW);
  delayMicroseconds(2);
  digitalWrite(trig_, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig_, LOW);
  unsigned long us = pulseIn(echo_, HIGH, 30000UL);  // about 5 m max
  return us / 58.0;
}`,
  },
  StfTempProbe: {
    header: `class StfTempProbe {
public:
  explicit StfTempProbe(uint8_t pin) : wire_(pin), sensors_(&wire_) {}
  void begin() { sensors_.begin(); }
  float readC();  // °C, or -127 when no probe answers
private:
  OneWire wire_;
  DallasTemperature sensors_;
};`,
    source: `float StfTempProbe::readC() {
  sensors_.requestTemperatures();
  return sensors_.getTempCByIndex(0);
}`,
  },
  StfRgbLed: {
    header: `class StfRgbLed {
public:
  StfRgbLed(uint8_t r, uint8_t g, uint8_t b, bool commonAnode) : r_(r), g_(g), b_(b), anode_(commonAnode) {}
  void begin();
  void color(uint8_t red, uint8_t green, uint8_t blue);
  void off() { color(0, 0, 0); }
private:
  uint8_t r_, g_, b_;
  bool anode_;
};`,
    source: `void StfRgbLed::begin() {
  pinMode(r_, OUTPUT);
  pinMode(g_, OUTPUT);
  pinMode(b_, OUTPUT);
  off();
}

void StfRgbLed::color(uint8_t red, uint8_t green, uint8_t blue) {
  analogWrite(r_, anode_ ? 255 - red : red);
  analogWrite(g_, anode_ ? 255 - green : green);
  analogWrite(b_, anode_ ? 255 - blue : blue);
}`,
  },
  StfRelay: {
    header: `class StfRelay {
public:
  StfRelay(uint8_t pin, uint8_t onLevel) : pin_(pin), onLevel_(onLevel) {}
  void begin() { pinMode(pin_, OUTPUT); off(); }
  void on() { digitalWrite(pin_, onLevel_); on_ = true; }
  void off() { digitalWrite(pin_, onLevel_ == HIGH ? LOW : HIGH); on_ = false; }
  void toggle() { if (on_) off(); else on(); }
  bool isOn() const { return on_; }
private:
  uint8_t pin_, onLevel_;
  bool on_ = false;
};`,
    source: '',
  },
};

// Every library any component can use; fetch-toolchain bundles these.
export function allComponentLibraries() {
  return [...new Set(Object.values(COMPONENTS).flatMap((c) => c.libraries ?? []))];
}
