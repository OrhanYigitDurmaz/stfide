// UI strings. Add a new language by copying `en` and translating the values,
// then registering it in LANGUAGES. Placeholders look like {name}.

const en = {
  // toolbar
  'toolbar.verify': 'Verify',
  'toolbar.upload': 'Upload',
  'toolbar.new': 'New',
  'toolbar.open': 'Open',
  'toolbar.save': 'Save',
  'toolbar.examples': 'Examples',
  'toolbar.port': 'Port',
  'toolbar.noPort': 'No board connected',
  'toolbar.monitor': 'Serial Monitor',
  'view.code': 'Code',
  'view.pins': 'Pins',
  'panel.output': 'Output',
  'panel.monitor': 'Serial Monitor',
  'panel.clear': 'Clear',

  // build
  'build.compiling': 'Compiling {sketch} for STFKart…',
  'build.uploading': 'Compiling and uploading {sketch} to {port}…',
  'build.done': 'Done compiling.',
  'build.uploaded': 'Done uploading.',
  'build.failed': 'Compilation failed. See the errors above.',
  'build.uploadFailed': 'Upload failed.',
  'build.noPort': 'Plug in your STFKart and pick its port before uploading.',
  'build.fixPins': 'Fix the errors on the Pins tab first.',
  'build.noCli': 'The Arduino compiler (arduino-cli) was not found. Reinstall STFIDE, or run `npm run fetch-toolchain` in a development checkout.',
  'build.noCore': 'The AVR compiler is not installed yet. Click "Install compiler" to download it (needs internet, about 100 MB).',
  'build.installCore': 'Install compiler',
  'build.installingCore': 'Downloading the AVR compiler…',

  // monitor
  'monitor.send': 'Send',
  'monitor.placeholder': 'Message to send to the board',
  'monitor.connect': 'Connect',
  'monitor.disconnect': 'Disconnect',
  'monitor.autoscroll': 'Autoscroll',
  'monitor.connected': 'Connected to {port} at {baud} baud.',
  'monitor.disconnected': 'Disconnected.',
  'monitor.pausedForUpload': 'Paused while uploading…',
  'monitor.lineEnding.none': 'No line ending',
  'monitor.lineEnding.nl': 'Newline',
  'monitor.lineEnding.cr': 'Carriage return',
  'monitor.lineEnding.both': 'Both NL & CR',

  // pins tab
  'pins.title': 'Pin setup',
  'pins.hint': 'Click a pin on the board to choose what it does.',
  'pins.pin': 'Pin {pin}',
  'pins.role': 'Used as',
  'pins.name': 'Name in code',
  'pins.namePlaceholder': 'e.g. redLed',
  'pins.initial': 'Starts',
  'pins.initial.low': 'Off (LOW)',
  'pins.initial.high': 'On (HIGH)',
  'pins.angle': 'Start angle (°)',
  'pins.pwmStart': 'Start value (0–255)',
  'pins.trigger': 'Trigger when',
  'pins.trigger.FALLING': 'Signal goes LOW (falling)',
  'pins.trigger.RISING': 'Signal goes HIGH (rising)',
  'pins.trigger.CHANGE': 'Signal changes',
  'pins.handler': 'Function to run',
  'pins.pullup': 'Use internal pull-up',
  'pins.peripherals': 'Communication',
  'pins.serial': 'Serial (USB)',
  'pins.baud': 'Baud rate',
  'pins.i2c': 'I2C (Wire)',
  'pins.i2cClock': 'Speed',
  'pins.spi': 'SPI',
  'pins.issues': 'Problems',
  'pins.noIssues': 'No problems found.',
  'pins.generated': 'Generated code',
  'pins.usage': 'How to use it',
  'pins.insertHandler': 'Add {fn}() to my sketch',

  // roles
  'role.unused': 'Not used',
  'role.led': 'LED',
  'role.output': 'Digital output',
  'role.button': 'Button',
  'role.input': 'Digital input',
  'role.pwm': 'PWM output (analogWrite)',
  'role.analog': 'Analog input (analogRead)',
  'role.servo': 'Servo motor',
  'role.interrupt': 'Interrupt input',
  'role.buzzer': 'Buzzer (tone)',

  // validation
  'issue.nameMissing': '{pin}: give this pin a name so you can use it in code.',
  'issue.nameInvalid': '{pin}: "{name}" is not a valid name. Use letters, digits and _, starting with a letter.',
  'issue.nameReserved': '{pin}: "{name}" is already used by Arduino. Pick another name.',
  'issue.nameDuplicate': '"{name}" is used for more than one pin ({pins}).',
  'issue.handlerInvalid': '{pin}: "{name}" is not a valid function name.',
  'issue.roleNotSupported': '{pin} can\'t be used as {role}.',
  'issue.pwmPins': 'PWM only works on D3, D5, D6, D9, D10 and D11.',
  'issue.interruptPins': 'Interrupts only work on D2 and D3.',
  'issue.analogPins': 'Analog input only works on A0–A5.',
  'issue.serialPin': '{pin} is used by Serial ({label}). Turn off Serial or pick another pin.',
  'issue.serialShared': '{pin} is wired to the USB chip. Using it can stop uploads from working; unplug what is connected to it before uploading.',
  'issue.i2cPin': '{pin} is used by I2C ({label}). Turn off I2C or pick another pin.',
  'issue.spiPin': '{pin} is used by SPI ({label}). Turn off SPI or pick another pin.',
  'issue.spiSS': 'D10 must stay an output while SPI is on. Use it as a chip-select output or leave it unused.',
  'issue.servoTimer': 'Servos use Timer1, so analogWrite() on {pins} will not work.',
  'issue.toneTimer': 'tone() uses Timer2, so analogWrite() on {pins} will not work.',
  'issue.tooManyBuzzers': 'Only one buzzer can play tone() at a time.',
  'issue.ledBuiltin': 'D13 also drives the on-board LED, so it will light up too.',
  'issue.pinShared': '{pin} is used more than once: {users}.',
  'issue.componentNameMissing': 'Give the {component} a name so you can use it in code.',
  'issue.componentPinMissing': '{name}: choose a pin for {label}.',
  'issue.componentPinNeeds': '{name}: {label} on {pin} needs {need}.',
  'issue.needsI2c': '{name} talks over I2C. Turn on I2C under Communication.',
  'need.pwm': 'a PWM pin (D3, D5, D6, D9, D10 or D11)',
  'need.interrupt': 'an interrupt pin (D2 or D3)',
  'need.digital': 'a digital pin',

  // components
  'components.title': 'Components',
  'components.add': 'Add component',
  'components.none': 'Sensors, displays and other parts with ready-to-use code.',
  'components.remove': 'Remove',
  'components.pick': 'Choose a component',
  'components.cancel': 'Cancel',
  'components.bus': 'Connects to',
  'components.library': 'Library',
};

const tr = {};

export const LANGUAGES = { en, tr };

let current = 'en';

export function setLanguage(lang) {
  if (LANGUAGES[lang]) current = lang;
}

export function t(key, vars = {}) {
  const s = LANGUAGES[current][key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
