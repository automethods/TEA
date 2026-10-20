import { utf8Bytes, utf8Length, decodeUtf8 } from '../runtime.js';
import type { SourceRange } from './document.js';

/** Byte length of a string when encoded as UTF-8. */
export function utf8ByteLength(text: string): number {
  return utf8Length(text);
}

/** Convert a UTF-16 code-unit offset (JS string index) into a UTF-8 byte offset. */
export function charOffsetToByteOffset(source: string, charOffset: number): number {
  return utf8Length(source.slice(0, charOffset));
}

/** Convert a UTF-8 byte offset into a UTF-16 code-unit offset (JS string index). */
export function byteOffsetToCharOffset(source: string, byteOffset: number): number {
  const buf = utf8Bytes(source);
  return decodeUtf8(buf.subarray(0, byteOffset)).length;
}

/** 1-based line number containing the given UTF-16 code-unit offset. */
export function lineForCharOffset(source: string, charOffset: number): number {
  let line = 1;
  for (let i = 0; i < charOffset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** Build a SourceRange from a source string and start/end UTF-16 code-unit offsets. */
export function makeSourceRange(
  source: string,
  startChar: number,
  endChar: number,
): SourceRange {
  return {
    startByte: charOffsetToByteOffset(source, startChar),
    endByte: charOffsetToByteOffset(source, endChar),
    startLine: lineForCharOffset(source, startChar),
    endLine: lineForCharOffset(source, endChar),
  };
}
