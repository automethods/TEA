/** Bounded delimited text, with RFC 4180 quoting. Imports are DATA, never formulas.
 * Comma/semicolon/tab and LF/CRLF are explicit supported dialects. No network.
 */
import { TABLE_LIMITS, fault } from './native-contract.js';
import { sha256Text, utf8Length } from './runtime.js';
export interface CsvOptions { delimiter?: ',' | ';' | '\t'; header?: boolean; decimalSeparator?: '.' | ','; }
export interface ParsedCsv { headers: string[]; rows: string[][]; sourceHash: string; delimiter: ',' | ';' | '\t'; header: boolean; decimalSeparator: '.' | ','; }
export function parseCsv(text: string, options: CsvOptions = {}): ParsedCsv {
    if (typeof text !== 'string') fault('INVALID_ARGUMENT', 'CSV must be text.');
    if (utf8Length(text) > TABLE_LIMITS.csvBytes) fault('LIMIT_EXCEEDED', 'CSV exceeds 100 KB. Split the dataset before importing.');
    const delimiter = options.delimiter ?? ',', header = options.header ?? true, decimalSeparator = options.decimalSeparator ?? '.';
    if (![',',';','\t'].includes(delimiter) || typeof header !== 'boolean' || !['.',','].includes(decimalSeparator) || (delimiter === ',' && decimalSeparator === ','))
        fault('INVALID_ARGUMENT', 'Choose a supported delimiter; decimal comma needs semicolon or tab.');
    if (/\0/.test(text)) fault('INVALID_ARGUMENT', 'CSV contains a NUL character.');
    const sourceHash = 'sha256:' + sha256Text(text), source = text.replace(/^\uFEFF/, '');
    if (!source.length) fault('INVALID_ARGUMENT', 'CSV is empty.');
    const records: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false, started = false;
    const pushField = () => {
        if (field.length > TABLE_LIMITS.fieldChars) fault('LIMIT_EXCEEDED', 'CSV field exceeds the text limit.');
        row.push(field); field = ''; started = false; closed = false;
        if (row.length > TABLE_LIMITS.columns) fault('LIMIT_EXCEEDED', 'CSV exceeds 26 columns.');
    };
    const pushRow = () => { pushField(); records.push(row); row = []; if (records.length > TABLE_LIMITS.rows + (header ? 1 : 0)) fault('LIMIT_EXCEEDED', 'CSV exceeds the supported row count.'); };
    for (let i = 0; i < source.length; i++) {
        const c = source[i]!;
        if (quoted) {
            if (c === '"') { if (source[i+1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
            else field += c;
        } else if (c === delimiter) pushField();
        else if (c === '\r' || c === '\n') { if (c === '\r' && source[i+1] === '\n') i++; pushRow(); }
        else if (closed) fault('INVALID_ARGUMENT', `Unexpected content after a quoted CSV field at character ${i+1}.`);
        else if (c === '"') { if (started || field.length) fault('INVALID_ARGUMENT', 'Quotes in an unquoted CSV field must be escaped.'); quoted = true; started = true; }
        else { field += c; started = true; }
        if (field.length > TABLE_LIMITS.fieldChars) fault('LIMIT_EXCEEDED', 'CSV field exceeds the text limit.');
    }
    if (quoted) fault('INVALID_ARGUMENT', 'CSV has an unterminated quoted field.');
    if (started || closed || field.length || row.length) pushRow();
    if (!records.length) fault('INVALID_ARGUMENT', 'CSV has no records.');
    const width = records[0]!.length;
    if (records.some(r => r.length !== width)) fault('INVALID_ARGUMENT', 'CSV rows have inconsistent column counts. Nothing was imported.');
    const headers = header ? records.shift()! : Array.from({length: width}, (_, i) => 'Column ' + (i+1));
    if (headers.some(h => h.length > 200)) fault('LIMIT_EXCEEDED', 'CSV column labels exceed 200 characters.');
    if (records.length * width > TABLE_LIMITS.cells) fault('LIMIT_EXCEEDED', 'CSV exceeds 500 cells.');
    return { headers, rows: records, sourceHash, delimiter, header, decimalSeparator };
}
/** Spreadsheet-oriented CSV export neutralizes leading formula triggers in TEXT.
 * The original document is unchanged. This is not a guarantee for every spreadsheet
 * importer or a subsequent save/reopen in a third-party application.
 */
export function writeCsv(rows: Array<Array<{text: string; numeric?: boolean}>>, delimiter: ',' | ';' | '\t' = ','): { text: string; neutralized: number } {
    if (![',',';','\t'].includes(delimiter)) fault('INVALID_ARGUMENT', 'Unsupported delimiter.');
    let neutralized = 0;
    const output = rows.map(row => row.map(cell => {
        let text = cell.text;
        if (cell.numeric && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) fault('INVALID_ARGUMENT', 'Only lexical numbers may bypass text formula neutralization.');
        if (!cell.numeric && (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))) { text = "'" + text; neutralized++; }
        return '"' + text.replaceAll('"', '""') + '"';
    }).join(delimiter)).join('\r\n') + '\r\n';
    return { text: output, neutralized };
}
