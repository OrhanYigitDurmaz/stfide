/**
 * RPC protocol shared by the board-tools frontend and backend.
 *
 * `stfide-gen` is imported with `import type` on purpose: the browser bundle
 * must not pull in stfide-gen runtime code, only the Node backend uses it.
 */
import type { BoardModel, Issue } from 'stfide-gen';

export const BoardToolsServicePath = '/services/board-tools';

export interface BoardSummary {
    /** Absolute path of the `*.board.json` file. */
    path: string;
    /** Machine name (`name` field of the board file). */
    name: string;
    displayName?: string;
    mcu: string;
    pinCount: number;
}

export interface BoardDetails {
    board: BoardModel;
    /** Result of `validateBoard`; contains errors and warnings. */
    issues: Issue[];
}

export interface GeneratedFileResult {
    target: string;
    /** Absolute paths of the files written for this target. */
    files: string[];
    /** Absolute paths of files whose previous USER CODE content was merged in. */
    merged: string[];
}

export interface GenerateOutcome {
    /** One entry per successfully generated target (in request order). */
    results: GeneratedFileResult[];
    /** First target-level error, if any. Partial results are still returned. */
    error?: string;
}

export const BoardToolsService = Symbol('BoardToolsService');
export interface BoardToolsService {
    /** Scan `<root>/boards/*.board.json` and return one summary per board file. */
    listBoards(root: string): Promise<BoardSummary[]>;
    /** Read and structurally validate one board file. */
    readBoard(path: string): Promise<BoardDetails>;
    /** Generate code for the given targets into `<root>/generated/<target>/`. */
    generate(path: string, targets: string[]): Promise<GenerateOutcome>;
}
