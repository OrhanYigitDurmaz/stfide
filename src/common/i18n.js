// UI strings. Add a new language by copying `en` into its own file,
// translating the values, and registering it in LANGUAGES and
// LANGUAGE_NAMES. Placeholders look like {name}. Missing keys fall back
// to English.

import { tr } from './i18n-tr.js';

const en = {
  // toolbar
  'toolbar.verify': 'Verify',
  'toolbar.upload': 'Upload',
  'toolbar.new': 'New',
  'toolbar.open': 'Open',
  'toolbar.save': 'Save',
  'toolbar.examples': 'Examples',
  'toolbar.noPort': 'No board connected',
  'toolbar.monitor': 'Serial Monitor',
  'view.code': 'Code',
  'view.pins': 'Circuit',
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
  'build.fixPins': 'Fix the errors on the Circuit tab first.',
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

  // circuit
  'circuit.notWired': '{name} isn\'t wired to a pin yet. {hint}',
  'circuit.pinNotWired': '{name}: connect {pin} to a pin.',
  'circuit.shorted': '{name} is connected to more than one pin ({pins}).',
  'circuit.i2cWire': '{name}: wire {pin} to {board}.',
  'circuit.title': 'Circuit',
  'circuit.hint': 'Click a pin to start a wire, click empty space to bend it, click another pin to finish. Esc cancels.',
  'circuit.help1': 'Add parts from the list on the left, then drag them where you like.',
  'circuit.help2': 'Wire each part to the STFKart: click a pin, then another pin. The code for it is written for you.',
  'circuit.help3': 'Select a part or wire and press Delete to remove it, or R to rotate a part. Ctrl+Z undoes.',
  'circuit.help4': 'Click the board to set up pins that have no part on them by hand.',
  'circuit.boardHint': 'Pins wired to a part are set up by that part. Click any other pin to choose what it does.',
  'circuit.connectedTo': 'Connected to',
  'circuit.protocol': 'Communication',
  'circuit.bands': 'Color bands',
  'circuit.resistanceHelp': 'Ohms. You can write 220, 4.7k, 4k7, 10k or 1M.',
  'circuit.nothing': 'Not wired yet',
  'circuit.rotate': 'Rotate (R)',
  'circuit.delete': 'Delete',
  'circuit.wire': 'Wire',
  'circuit.color': 'Color',
  'circuit.zoomIn': 'Zoom in',
  'circuit.zoomOut': 'Zoom out',
  'circuit.fit': 'Fit to window',
  'circuit.undo': 'Undo (Ctrl+Z)',
  'circuit.redo': 'Redo (Ctrl+Y)',
  'circuit.i2cForced': 'A part on the circuit uses I2C, so it stays on.',
  'palette.title': 'Parts',
  'palette.basic': 'Basics',
  'palette.sensors': 'Sensors',
  'palette.outputs': 'Motors & displays',

  'components.library': 'Library',

  // settings
  'toolbar.settings': 'Settings',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageNote': 'The window reloads to switch the language. Part names in generated code stay in English.',
  'settings.fontSize': 'Editor font size',
  'settings.sketchbook': 'Sketchbook folder',
  'settings.sketchbookHint': 'New sketches are created here, and Open starts here.',
  'settings.browse': 'Browse…',
  'settings.default': 'Use default',
  'settings.badFolder': 'Can\'t use that folder: {error}',

  // dialogs and status bar
  'dialog.cancel': 'Cancel',
  'dialog.save': 'Save',
  'dialog.dontSave': 'Don\'t save',
  'dialog.create': 'Create',
  'dialog.saveFirst': 'Save changes to your sketch first?',
  'dialog.saveBeforeClose': 'Save changes to your sketch before closing?',
  'dialog.openSketch': 'Open sketch',
  'dialog.saveSketchAs': 'Save sketch as',
  'dialog.newTab': 'Name for the new file (e.g. helpers.h or motors). Without an extension it becomes a .ino tab.',
  'dialog.badTabName': 'Use letters, digits and _, ending in .ino, .h, .cpp or .c.',
  'dialog.tabExists': 'A file with that name already exists.',
  'tabs.new': 'New tab',
  'monitor.baud': '{baud} baud',
  'status.boardOn': '{board} on {port}',
  'status.notConnected': '{board} (not connected)',

  // menus (main process)
  'menu.file': 'File',
  'menu.newSketch': 'New Sketch',
  'menu.open': 'Open…',
  'menu.save': 'Save',
  'menu.saveAs': 'Save As…',
  'menu.newTab': 'New Tab…',
  'menu.openSketchbook': 'Open Sketchbook Folder',
  'menu.settings': 'Settings…',
  'menu.sketch': 'Sketch',
  'menu.verify': 'Verify',
  'menu.upload': 'Upload',
  'menu.showCircuit': 'Show Circuit',
  'menu.showCode': 'Show Code',
  'menu.showFolder': 'Show Sketch Folder',
  'menu.tools': 'Tools',
  'menu.serialMonitor': 'Serial Monitor',
  'menu.view': 'View',
  'menu.help': 'Help',
  'menu.reference': 'Arduino Language Reference',
  'menu.about': 'About STFIDE',
  'menu.aboutDetail': 'An Arduino-style IDE for the STFKart board.',
};

// Display names, in their own language, for the Settings window.
export const LANGUAGE_NAMES = { en: 'English', tr: 'Türkçe' };
export const LANGUAGES = { en, tr };

let current = 'en';

export function setLanguage(lang) {
  if (LANGUAGES[lang]) current = lang;
}

export function getLanguage() {
  return current;
}

// For strings whose English lives next to their data (part names and
// hints): the translation if there is one, otherwise `fallback`.
export function tx(key, fallback) {
  return LANGUAGES[current][key] ?? fallback;
}

export function t(key, vars = {}) {
  const s = LANGUAGES[current][key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
