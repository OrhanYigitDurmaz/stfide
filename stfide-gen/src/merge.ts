/**
 * USER CODE merge for regeneration round-trips.
 *
 * Generated source files contain sections delimited by C block comments of
 * the form "USER CODE BEGIN <section>" / "USER CODE END <section>". All
 * markers use the exact literal text defined by the emitters.
 *
 * Regenerating a file preserves whatever the user wrote between those markers.
 * The merge is deterministic and never inspects the generated content itself:
 * the generated structure always wins, only the *contents* inside the markers
 * are carried over from the existing file.
 */

/** One marker line: optional indent, exact section name, optional trailing CR. */
const BEGIN_SOURCE = '^([ \\t]*)/\\* USER CODE BEGIN ([A-Za-z0-9_]+) \\*/[ \\t]*\\r?$';

function endPattern(section: string): RegExp {
    // Section names are [A-Za-z0-9_]+ so no regex escaping is needed.
    return new RegExp(`^[ \\t]*/\\* USER CODE END ${section} \\*/[ \\t]*\\r?$`, 'm');
}

/** Collect the first BEGIN/END pair per section name from a source text. */
function sectionsOf(text: string): Map<string, string> {
    const sections = new Map<string, string>();
    const begin = new RegExp(BEGIN_SOURCE, 'gm');
    let match: RegExpExecArray | null;
    while ((match = begin.exec(text)) !== null) {
        const name = match[2];
        if (sections.has(name)) {
            continue;
        }
        const contentStart = match.index + match[0].length;
        const end = endPattern(name).exec(text.slice(contentStart));
        if (end === null) {
            // Malformed marker pair (BEGIN without END): treat the section as absent.
            continue;
        }
        sections.set(name, text.slice(contentStart, contentStart + end.index));
    }
    return sections;
}

/**
 * Merge user code from `existing` into freshly `generated` content.
 *
 * - For every section present in `generated`, the content between the
 *   BEGIN/END markers in `existing` (same section name) replaces the content
 *   between the generated markers.
 * - Sections present only in `existing` are dropped (generated structure wins).
 * - Missing or malformed existing markers keep the generated content.
 */
export function mergeUserCode(generated: string, existing: string): string {
    const userSections = sectionsOf(existing);
    if (userSections.size === 0) {
        return generated;
    }

    const begin = new RegExp(BEGIN_SOURCE, 'gm');
    let result = '';
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = begin.exec(generated)) !== null) {
        const name = match[2];
        const userContent = userSections.get(name);
        if (userContent === undefined) {
            continue;
        }
        const contentStart = match.index + match[0].length;
        const end = endPattern(name).exec(generated.slice(contentStart));
        if (end === null) {
            // Generated marker pair is malformed; keep the file as generated.
            continue;
        }
        const endStart = contentStart + end.index;
        result += generated.slice(cursor, contentStart) + userContent;
        cursor = endStart;
        begin.lastIndex = endStart;
    }
    return result + generated.slice(cursor);
}
