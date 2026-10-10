import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs/promises';
import * as path from 'path';
import { allEmitters, emitterById, mergeUserCode, validateBoard } from 'stfide-gen';
import type { BoardModel } from 'stfide-gen';
import {
    BoardDetails,
    BoardSummary,
    BoardToolsService,
    GenerateOutcome,
    GeneratedFileResult
} from '../common/board-tools-protocol';

@injectable()
export class BoardToolsServiceImpl implements BoardToolsService {

    async listBoards(root: string): Promise<BoardSummary[]> {
        const boardsDir = path.join(root, 'boards');
        let entries: string[];
        try {
            entries = await fs.readdir(boardsDir);
        } catch {
            return [];
        }
        const summaries: BoardSummary[] = [];
        for (const entry of entries.filter(name => name.endsWith('.board.json')).sort()) {
            const boardPath = path.join(boardsDir, entry);
            try {
                const data = JSON.parse(await fs.readFile(boardPath, 'utf-8')) as Record<string, unknown>;
                summaries.push({
                    path: boardPath,
                    name: typeof data.name === 'string' && data.name.length > 0
                        ? data.name
                        : entry.replace(/\.board\.json$/, ''),
                    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
                    mcu: typeof data.mcu === 'string' ? data.mcu : 'unknown',
                    pinCount: Array.isArray(data.pins) ? data.pins.length : 0
                });
            } catch {
                // Skip files that cannot be read or parsed; Validate reports details for a selected board.
            }
        }
        return summaries;
    }

    async readBoard(boardPath: string): Promise<BoardDetails> {
        const text = await fs.readFile(boardPath, 'utf-8');
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error(`${boardPath}: not valid JSON: ${(error as Error).message}`);
        }
        return { board: data as BoardModel, issues: validateBoard(data) };
    }

    async generate(boardPath: string, targets: string[]): Promise<GenerateOutcome> {
        let data: unknown;
        try {
            data = JSON.parse(await fs.readFile(boardPath, 'utf-8'));
        } catch (error) {
            return { results: [], error: `${boardPath}: ${(error as Error).message}` };
        }

        const errors = validateBoard(data).filter(issue => issue.level === 'error');
        if (errors.length > 0) {
            return {
                results: [],
                error: `board definition is invalid: ${errors.map(issue => issue.message).join('; ')}`
            };
        }

        const board = data as BoardModel;
        const root = path.dirname(path.dirname(boardPath));
        const outRoot = path.join(root, 'generated');
        const results: GeneratedFileResult[] = [];
        let error: string | undefined;

        for (const target of targets) {
            const emitter = emitterById(target);
            if (!emitter) {
                error ??= `unknown target "${target}" (known targets: ${allEmitters.map(candidate => candidate.id).join(', ')})`;
                continue;
            }
            if (!emitter.supportedMcus.includes(board.mcu)) {
                error ??= `target "${target}" does not support mcu "${board.mcu}"`;
                continue;
            }
            try {
                const files = emitter.emit({ board, sourcePath: boardPath })
                    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
                const targetDir = path.join(outRoot, target);
                const written: string[] = [];
                const merged: string[] = [];
                for (const file of files) {
                    const destination = path.join(targetDir, file.path);
                    await fs.mkdir(path.dirname(destination), { recursive: true });
                    let content = file.content;
                    const existing = await fs.readFile(destination, 'utf-8').then(value => value, () => undefined);
                    if (existing !== undefined) {
                        content = mergeUserCode(file.content, existing);
                        if (existing.includes('/* USER CODE BEGIN')) {
                            merged.push(destination);
                        }
                    }
                    await fs.writeFile(destination, content);
                    written.push(destination);
                }
                results.push({ target, files: written, merged });
            } catch (emitError) {
                error ??= `${target}: ${(emitError as Error).message}`;
            }
        }

        return error ? { results, error } : { results };
    }
}
