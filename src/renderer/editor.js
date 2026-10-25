// Monaco editor setup: one model per sketch file, Arduino-aware
// autocomplete (including pin names from the Pins tab), and error markers.

import { namesForPin, usageFor } from '../common/pins.js';
import { t } from '../common/i18n.js';

let monaco = null;

export function loadMonaco() {
  return new Promise((resolve) => {
    window.require.config({ paths: { vs: '../../node_modules/monaco-editor/min/vs' } });
    window.require(['vs/editor/editor.main'], () => {
      monaco = window.monaco;
      resolve(monaco);
    });
  });
}

// Common Arduino functions, offered as snippets.
const ARDUINO_API = [
  ['pinMode', 'pinMode(${1:pin}, ${2|OUTPUT,INPUT,INPUT_PULLUP|});', 'Sets a pin as input or output. The Pins tab does this for you.'],
  ['digitalWrite', 'digitalWrite(${1:pin}, ${2|HIGH,LOW|});', 'Turns a digital pin on (HIGH) or off (LOW).'],
  ['digitalRead', 'digitalRead(${1:pin})', 'Reads a digital pin: HIGH or LOW.'],
  ['analogRead', 'analogRead(${1:pin})', 'Reads an analog pin (A0–A5): 0 to 1023.'],
  ['analogWrite', 'analogWrite(${1:pin}, ${2:128});', 'PWM output on D3, D5, D6, D9, D10, D11: 0 to 255.'],
  ['delay', 'delay(${1:1000});', 'Waits the given number of milliseconds.'],
  ['delayMicroseconds', 'delayMicroseconds(${1:100});', 'Waits the given number of microseconds.'],
  ['millis', 'millis()', 'Milliseconds since the board started.'],
  ['micros', 'micros()', 'Microseconds since the board started.'],
  ['tone', 'tone(${1:pin}, ${2:440}, ${3:200});', 'Plays a note: frequency in Hz, length in ms.'],
  ['noTone', 'noTone(${1:pin});', 'Stops a tone.'],
  ['map', 'map(${1:value}, ${2:0}, ${3:1023}, ${4:0}, ${5:255})', 'Re-maps a number from one range to another.'],
  ['constrain', 'constrain(${1:value}, ${2:0}, ${3:255})', 'Keeps a number within a range.'],
  ['random', 'random(${1:0}, ${2:100})', 'Random number from min up to (not including) max.'],
  ['pulseIn', 'pulseIn(${1:pin}, ${2|HIGH,LOW|})', 'Measures a pulse length in microseconds.'],
  ['Serial.println', 'Serial.println(${1});', 'Prints a value and a new line to the Serial Monitor.'],
  ['Serial.print', 'Serial.print(${1});', 'Prints a value to the Serial Monitor.'],
  ['Serial.available', 'Serial.available()', 'Number of bytes waiting to be read.'],
  ['Serial.read', 'Serial.read()', 'Reads one byte from the Serial Monitor.'],
  ['Serial.parseInt', 'Serial.parseInt()', 'Reads a whole number typed in the Serial Monitor.'],
];

const SNIPPETS = [
  ['if', 'if (${1:condition}) {\n\t$0\n}', 'if statement'],
  ['ifelse', 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}', 'if / else'],
  ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:10}; ${1:i}++) {\n\t$0\n}', 'for loop'],
  ['while', 'while (${1:condition}) {\n\t$0\n}', 'while loop'],
  ['every', 'static unsigned long ${1:last} = 0;\nif (millis() - ${1:last} >= ${2:1000}) {\n\t${1:last} = millis();\n\t$0\n}', 'Run code every N milliseconds without delay()'],
];

const CONSTANTS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'true', 'false',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'RISING', 'FALLING', 'CHANGE'];

export class Editor {
  constructor(container, { onChange, onCursor }) {
    this.models = new Map();
    this.config = null;
    this.editor = monaco.editor.create(container, {
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Cascadia Code, DejaVu Sans Mono, Consolas, monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      renderWhitespace: 'none',
      bracketPairColorization: { enabled: true },
      suggest: { showWords: false },
      fixedOverflowWidgets: true,
    });
    this.editor.onDidChangeCursorPosition((e) => onCursor(e.position));
    this.onChange = onChange;
    this.registerLanguageFeatures();
  }

  setConfig(config) {
    this.config = config;
  }

  // files: [{ name, content, readOnly }]
  setFiles(files) {
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    for (const f of files) this.addFile(f);
  }

  addFile({ name, content }) {
    const model = monaco.editor.createModel(content, 'cpp', monaco.Uri.file(`/sketch/${name}`));
    model.onDidChangeContent(() => this.onChange(name));
    this.models.set(name, model);
    return model;
  }

  removeFile(name) {
    this.models.get(name)?.dispose();
    this.models.delete(name);
  }

  // Replaces the text without making the file dirty; used for generated files.
  replaceContent(name, content) {
    const model = this.models.get(name);
    if (!model) return this.addFile({ name, content });
    if (model.getValue() !== content) model.setValue(content);
    return model;
  }

  show(name, readOnly) {
    const model = this.models.get(name);
    if (!model) return;
    this.editor.setModel(model);
    this.editor.updateOptions({ readOnly: Boolean(readOnly) });
    this.editor.focus();
  }

  getContent(name) {
    return this.models.get(name)?.getValue() ?? '';
  }

  reveal(name, line, column, readOnly) {
    this.show(name, readOnly);
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column });
    this.editor.focus();
  }

  insertAtEnd(name, text) {
    const model = this.models.get(name);
    const last = model.getLineCount();
    const col = model.getLineMaxColumn(last);
    model.pushEditOperations([], [{ range: new monaco.Range(last, col, last, col), text }], () => null);
    this.reveal(name, model.getLineCount(), 1);
  }

  // diagnostics: [{ file, line, column, severity, message }]
  setDiagnostics(diagnostics) {
    for (const [name, model] of this.models) {
      const markers = diagnostics
        .filter((d) => d.file === name)
        .map((d) => ({
          severity: d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
          message: d.message,
          startLineNumber: d.line,
          startColumn: d.column,
          endLineNumber: d.line,
          endColumn: model.getLineMaxColumn(Math.min(d.line, model.getLineCount())),
        }));
      monaco.editor.setModelMarkers(model, 'arduino', markers);
    }
  }

  registerLanguageFeatures() {
    const K = monaco.languages.CompletionItemKind;
    const Rule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

    monaco.languages.registerCompletionItemProvider('cpp', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const items = [];

        // Pins first: they are what beginners are looking for.
        for (const [pinId, p] of Object.entries(this.config?.pins ?? {})) {
          const role = t(`role.${p.role}`);
          for (const name of namesForPin(p)) {
            items.push({
              label: name,
              kind: name === p.name ? K.Variable : K.Function,
              detail: `${role} on ${pinId}`,
              insertText: name.endsWith('Pressed') && name !== p.name ? `${name}()` : name,
              range,
              sortText: `0${name}`,
            });
          }
          usageFor(p).forEach((snippet, i) => {
            items.push({
              label: `${p.name}: ${snippet.split('\n')[0]}`,
              filterText: p.name,
              kind: K.Snippet,
              detail: `${role} on ${pinId}`,
              insertText: snippet.replace('\n  \n', '\n\t$0\n'),
              insertTextRules: Rule,
              range,
              sortText: `1${p.name}${i}`,
            });
          });
        }

        for (const [label, insertText, doc] of ARDUINO_API) {
          items.push({ label, kind: K.Function, insertText, insertTextRules: Rule, documentation: doc, range, sortText: `2${label}` });
        }
        for (const [label, insertText, doc] of SNIPPETS) {
          items.push({ label, kind: K.Snippet, insertText, insertTextRules: Rule, documentation: doc, range, sortText: `3${label}` });
        }
        for (const label of CONSTANTS) {
          items.push({ label, kind: K.Constant, insertText: label, range, sortText: `4${label}` });
        }
        return { suggestions: items };
      },
    });

    monaco.languages.registerHoverProvider('cpp', {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        for (const [pinId, p] of Object.entries(this.config?.pins ?? {})) {
          if (!namesForPin(p).includes(word.word)) continue;
          const usage = usageFor(p).map((s) => `    ${s.replace(/\n/g, '\n    ')}`).join('\n\n');
          return {
            contents: [
              { value: `**${p.name}**: ${t(`role.${p.role}`)} on pin **${pinId}**` },
              { value: usage },
            ],
          };
        }
        const api = ARDUINO_API.find(([label]) => label === word.word);
        return api ? { contents: [{ value: `**${api[0]}**` }, { value: api[2] }] } : null;
      },
    });
  }
}
