#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { loadBoard } from './load';
import { mergeUserCode } from './merge';
import { allEmitters, emitterById } from './registry';
import { filesSorted } from './util';

const USAGE = [
    'stfide-gen - board configuration code generator',
    '',
    'Usage:',
    '  stfide-gen targets',
    '  stfide-gen validate <board.json>',
    '  stfide-gen generate <board.json> --target <id> [--target <id> ...] [--out <dir>] [--no-merge]',
    '',
    'Options:',
    '  --target <id>   emitter to run (see "stfide-gen targets"); may be repeated',
    '  --out <dir>     output root directory (default: "generated")',
    '  --no-merge      overwrite existing files instead of merging USER CODE blocks',
    '  --help          show this help'
].join('\n');

interface ParsedArgs {
    positional: string[];
    options: Map<string, string[]>;
}

function parseArgs(args: string[]): ParsedArgs {
    const positional: string[] = [];
    const options = new Map<string, string[]>();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }
        const eq = arg.indexOf('=');
        let name: string;
        let value: string | undefined;
        if (eq >= 0) {
            name = arg.substring(2, eq);
            value = arg.substring(eq + 1);
        } else {
            name = arg.substring(2);
        }
        if (value === undefined) {
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                value = next;
                i++;
            }
        }
        const list = options.get(name) ?? [];
        list.push(value ?? '');
        options.set(name, list);
    }
    return { positional, options };
}

function runTargets(): number {
    console.log('Available targets:');
    for (const emitter of allEmitters) {
        console.log(`  ${emitter.id.padEnd(10)} ${emitter.displayName} [${emitter.supportedMcus.join(', ')}]`);
    }
    return 0;
}

function runValidate(positional: string[]): number {
    const boardPath = positional[0];
    if (positional.length !== 1 || !boardPath) {
        console.error('usage: stfide-gen validate <board.json>');
        return 1;
    }
    try {
        const loaded = loadBoard(boardPath);
        for (const issue of loaded.issues) {
            console.warn(`warning: ${issue.message}`);
        }
        console.log(`OK: board "${loaded.board.name}" is valid (mcu: ${loaded.board.mcu}).`);
        return 0;
    } catch (error) {
        console.error((error as Error).message);
        return 1;
    }
}

/**
 * True when the existing text contains at least one of the USER CODE sections
 * that the freshly generated text emits, or when the generated text has no
 * sections at all (nothing could be merged, so no warning is useful).
 */
function hasGeneratedUserSection(existing: string, generated: string): boolean {
    const names = new Set<string>();
    const pattern = /\/\* USER CODE BEGIN ([A-Za-z0-9_]+) \*\//g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(generated)) !== null) {
        names.add(match[1]);
    }
    if (names.size === 0) {
        return true;
    }
    for (const name of names) {
        if (existing.includes(`/* USER CODE BEGIN ${name} */`)) {
            return true;
        }
    }
    return false;
}

function runGenerate(positional: string[], options: Map<string, string[]>): number {
    const boardPath = positional[0];
    if (positional.length !== 1 || !boardPath) {
        console.error('usage: stfide-gen generate <board.json> --target <id> [--out <dir>] [--no-merge]');
        return 1;
    }
    const targets = (options.get('target') ?? []).filter(target => target.length > 0);
    if (targets.length === 0) {
        console.error(`error: at least one --target is required (available: ${allEmitters.map(e => e.id).join(', ')})`);
        return 1;
    }
    const outRoot = (options.get('out')?.[0]) || 'generated';
    const noMerge = options.has('no-merge');

    let loaded;
    try {
        loaded = loadBoard(boardPath);
    } catch (error) {
        console.error((error as Error).message);
        return 1;
    }
    for (const issue of loaded.issues) {
        console.warn(`warning: ${issue.message}`);
    }

    let failures = 0;
    for (const targetId of targets) {
        const emitter = emitterById(targetId);
        if (!emitter) {
            console.error(`error: unknown target "${targetId}" (available: ${allEmitters.map(e => e.id).join(', ')})`);
            failures++;
            continue;
        }
        if (!emitter.supportedMcus.includes(loaded.board.mcu)) {
            console.error(`error: target "${targetId}" does not support mcu "${loaded.board.mcu}"`);
            failures++;
            continue;
        }
        try {
            const files = filesSorted(emitter.emit({ board: loaded.board, sourcePath: boardPath }));
            const outDir = path.join(outRoot, targetId);
            const written: { destination: string; action: 'wrote' | 'merged' }[] = [];
            for (const file of files) {
                const destination = path.join(outDir, file.path);
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                let content = file.content;
                let action: 'wrote' | 'merged' = 'wrote';
                if (!noMerge && fs.existsSync(destination)) {
                    const existingContent = fs.readFileSync(destination, 'utf-8');
                    content = mergeUserCode(file.content, existingContent);
                    action = 'merged';
                    if (!hasGeneratedUserSection(existingContent, file.content)) {
                        console.warn(
                            `warning: ${destination} has no USER CODE markers; existing content was replaced`
                        );
                    }
                }
                fs.writeFileSync(destination, content);
                written.push({ destination, action });
            }
            console.log(`generated ${files.length} file(s) for target "${targetId}" in ${outDir}:`);
            for (const entry of written) {
                console.log(`  ${entry.action} ${entry.destination}`);
            }
        } catch (error) {
            console.error(`error: target "${targetId}": ${(error as Error).message}`);
            failures++;
        }
    }
    return failures === 0 ? 0 : 1;
}

function run(argv: string[]): number {
    if (argv.length === 0 || argv.includes('--help') || argv[0] === 'help') {
        console.log(USAGE);
        return argv.length === 0 ? 1 : 0;
    }
    const command = argv[0];
    const { positional, options } = parseArgs(argv.slice(1));
    switch (command) {
        case 'targets':
            return runTargets();
        case 'validate':
            return runValidate(positional);
        case 'generate':
            return runGenerate(positional, options);
        default:
            console.error(`unknown command "${command}"`);
            console.error(USAGE);
            return 1;
    }
}

process.exitCode = run(process.argv.slice(2));
