import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * CLI-level round-trip tests: generate into a temp directory, edit the
 * generated file, generate again and check that USER CODE survives.
 */

const CLI = path.join(__dirname, '..', 'cli.js');
const BOARD = path.join(__dirname, '..', '..', '..', 'boards', 'oc1-rp2040.board.json');

interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

function run(args: string[]): RunResult {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'stfide-gen-cli-'));
}

test('generate merges USER CODE blocks on the second run', () => {
    const out = tempDir();
    try {
        const first = run(['generate', BOARD, '--target', 'pico', '--out', out]);
        assert.strictEqual(first.status, 0, first.stderr);
        assert.ok(first.stdout.includes('  wrote '), first.stdout);
        assert.ok(!first.stdout.includes('  merged '), first.stdout);

        const initPath = path.join(out, 'pico', 'board_init.c');
        const generated = fs.readFileSync(initPath, 'utf-8');
        const edited = generated
            .replace(
                '/* USER CODE BEGIN includes */\n/* USER CODE END includes */',
                '/* USER CODE BEGIN includes */\n#include "user_code.h"\n/* USER CODE END includes */'
            )
            .replace(
                '    /* USER CODE BEGIN board_init */\n    /* USER CODE END board_init */',
                '    /* USER CODE BEGIN board_init */\n    user_setup();\n    /* USER CODE END board_init */'
            );
        assert.notStrictEqual(edited, generated);
        fs.writeFileSync(initPath, edited);

        const second = run(['generate', BOARD, '--target', 'pico', '--out', out]);
        assert.strictEqual(second.status, 0, second.stderr);
        assert.ok(second.stdout.includes(`  merged ${initPath}`), second.stdout);

        const merged = fs.readFileSync(initPath, 'utf-8');
        assert.ok(merged.includes('#include "user_code.h"'));
        assert.ok(merged.includes('    user_setup();'));
        assert.ok(merged.includes('set_sys_clock_khz(133000, true);'));
        assert.ok(merged.includes('// PIO: pio0 SM0 drives PIN_LED_STRIP'));
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('generate --no-merge overwrites existing files', () => {
    const out = tempDir();
    try {
        assert.strictEqual(run(['generate', BOARD, '--target', 'pico', '--out', out]).status, 0);
        const initPath = path.join(out, 'pico', 'board_init.c');
        const generated = fs.readFileSync(initPath, 'utf-8');
        fs.writeFileSync(
            initPath,
            generated.replace(
                '/* USER CODE BEGIN includes */\n/* USER CODE END includes */',
                '/* USER CODE BEGIN includes */\n#include "user_code.h"\n/* USER CODE END includes */'
            )
        );

        const result = run(['generate', BOARD, '--target', 'pico', '--out', out, '--no-merge']);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.ok(result.stdout.includes(`  wrote ${initPath}`), result.stdout);
        assert.ok(!fs.readFileSync(initPath, 'utf-8').includes('user_code.h'));
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('generate warns when an existing file has no USER CODE markers', () => {
    const out = tempDir();
    try {
        const initPath = path.join(out, 'pico', 'board_init.c');
        fs.mkdirSync(path.dirname(initPath), { recursive: true });
        fs.writeFileSync(initPath, '/* hand written, no markers at all */\n');

        const result = run(['generate', BOARD, '--target', 'pico', '--out', out]);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.ok(
            result.stderr.includes(`warning: ${initPath} has no USER CODE markers; existing content was replaced`),
            result.stderr
        );
        const replaced = fs.readFileSync(initPath, 'utf-8');
        assert.ok(!replaced.includes('hand written'));
        assert.ok(replaced.includes('/* USER CODE BEGIN board_init */'));
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
