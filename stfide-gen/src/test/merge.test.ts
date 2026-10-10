import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeUserCode } from '../merge';

const GENERATED = [
    '#include "board_init.h"',
    '',
    '/* USER CODE BEGIN includes */',
    '/* USER CODE END includes */',
    '',
    'void board_init(void) {',
    '    gpio_init(1);',
    '',
    '    /* USER CODE BEGIN board_init */',
    '    /* USER CODE END board_init */',
    '}',
    ''
].join('\n');

function withUserCode(content: string): string {
    return GENERATED.replace('/* USER CODE BEGIN includes */\n/* USER CODE END includes */', content);
}

test('keeps content between the board_init markers, indentation and all', () => {
    const existing = GENERATED.replace(
        '    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */',
        '    /* USER CODE BEGIN board_init */\n    my_setup();\n\n    my_teardown();\n    /* USER CODE END board_init */'
    );
    const merged = mergeUserCode(GENERATED, existing);
    assert.ok(
        merged.includes(
            '    /* USER CODE BEGIN board_init */\n    my_setup();\n\n    my_teardown();\n    /* USER CODE END board_init */'
        )
    );
    // Generated code stays in place.
    assert.ok(merged.includes('    gpio_init(1);'));
});

test('keeps all sections at once', () => {
    const existing = GENERATED
        .replace(
            '/* USER CODE BEGIN includes */\n/* USER CODE END includes */',
            '/* USER CODE BEGIN includes */\n#include "extra.h"\n/* USER CODE END includes */'
        )
        .replace(
            '    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */',
            '    /* USER CODE BEGIN board_init */\n    init_extra();\n    /* USER CODE END board_init */'
        );
    const merged = mergeUserCode(GENERATED, existing);
    assert.ok(merged.includes('#include "extra.h"'));
    assert.ok(merged.includes('    init_extra();'));
    assert.ok(merged.includes('    gpio_init(1);'));
});

test('empty existing blocks reproduce the generated file', () => {
    assert.strictEqual(mergeUserCode(GENERATED, GENERATED), GENERATED);
});

test('existing file without markers yields the generated file', () => {
    const existing = 'int main(void) { return 0; }\n';
    assert.strictEqual(mergeUserCode(GENERATED, existing), GENERATED);
});

test('malformed existing markers (BEGIN without END) are treated as absent', () => {
    const existing = [
        '/* USER CODE BEGIN includes */',
        '#include "orphan.h"',
        'int not_the_end = 0;'
    ].join('\n');
    assert.strictEqual(mergeUserCode(GENERATED, existing), GENERATED);
});

test('sections present only in the existing file are dropped', () => {
    const existing = [
        '/* USER CODE BEGIN old_section */',
        'legacy();',
        '/* USER CODE END old_section */'
    ].join('\n');
    assert.strictEqual(mergeUserCode(GENERATED, existing), GENERATED);
});

test('END without BEGIN in the existing file is ignored', () => {
    const existing = ['/* USER CODE END board_init */', 'stray();'].join('\n');
    assert.strictEqual(mergeUserCode(GENERATED, existing), GENERATED);
});

test('user content is preserved byte for byte (tabs, trailing spaces, blank lines)', () => {
    const userContent = '\n\t#include "tabbed.h"   \n\n   \n/* keep me as is */';
    const existing = withUserCode(`/* USER CODE BEGIN includes */${userContent}\n/* USER CODE END includes */`);
    const merged = mergeUserCode(GENERATED, existing);
    assert.ok(merged.includes(`/* USER CODE BEGIN includes */${userContent}\n/* USER CODE END includes */`));
});

test('only the first BEGIN/END pair of a duplicated section is used', () => {
    const existing = [
        '/* USER CODE BEGIN includes */',
        '#include "first.h"',
        '/* USER CODE END includes */',
        '/* USER CODE BEGIN includes */',
        '#include "second.h"',
        '/* USER CODE END includes */'
    ].join('\n');
    const merged = mergeUserCode(GENERATED, existing);
    assert.ok(merged.includes('#include "first.h"'));
    assert.ok(!merged.includes('#include "second.h"'));
});

test('generated file without markers is returned unchanged', () => {
    const generated = 'int x;\n';
    const existing = '/* USER CODE BEGIN includes */\n#include "keep.h"\n/* USER CODE END includes */\n';
    assert.strictEqual(mergeUserCode(generated, existing), generated);
});

test('marker detection tolerates CRLF line endings in the existing file', () => {
    const existing = GENERATED.split('\n').join('\r\n').replace(
        '/* USER CODE BEGIN includes */\r\n/* USER CODE END includes */',
        '/* USER CODE BEGIN includes */\r\n#include "crlf.h"\r\n/* USER CODE END includes */'
    );
    const merged = mergeUserCode(GENERATED, existing);
    assert.ok(merged.includes('#include "crlf.h"'));
});
