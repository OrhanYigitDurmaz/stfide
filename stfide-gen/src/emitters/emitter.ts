import { BoardModel, Mcu } from '../model';

/** One file produced by an emitter, path relative to the target output directory. */
export interface GeneratedFile {
    path: string;
    content: string;
}

export interface EmitContext {
    board: BoardModel;
    /** Board file path exactly as the user supplied it (goes into banners). */
    sourcePath: string;
}

/**
 * A code generator backend. Implementations must be deterministic: the same
 * board model always produces byte-identical output (no timestamps, no
 * absolute paths, stable file and statement ordering).
 */
export interface Emitter {
    /** Stable id used on the command line, e.g. "arduino". */
    id: string;
    /** Human readable name shown by `stfide-gen targets`. */
    displayName: string;
    /** MCUs this emitter can produce code for. */
    supportedMcus: readonly Mcu[];
    emit(context: EmitContext): GeneratedFile[];
}
