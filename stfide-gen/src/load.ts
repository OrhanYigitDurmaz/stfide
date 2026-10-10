import * as fs from 'fs';
import { BoardModel } from './model';
import { Issue, validateBoard } from './validate';

export interface LoadedBoard {
    board: BoardModel;
    /** All findings; warnings only (errors throw). */
    issues: Issue[];
    /** Path exactly as provided by the caller (used in generated banners). */
    sourcePath: string;
}

/**
 * Parse and validate board JSON text.
 * Throws if the board has validation errors; warnings are returned in `issues`.
 */
export function parseBoard(text: string, sourcePath: string): LoadedBoard {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (error) {
        throw new Error(`${sourcePath}: not valid JSON: ${(error as Error).message}`);
    }
    const issues = validateBoard(data);
    const errors = issues.filter(issue => issue.level === 'error');
    if (errors.length > 0) {
        throw new Error(
            `${sourcePath}: board definition is invalid:\n` +
            errors.map(issue => `  - ${issue.message}`).join('\n')
        );
    }
    return { board: data as BoardModel, issues, sourcePath };
}

/** Read a board file from disk and validate it. */
export function loadBoard(file: string): LoadedBoard {
    let text: string;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (error) {
        throw new Error(`cannot read board file ${file}: ${(error as Error).message}`);
    }
    return parseBoard(text, file);
}
