import fs from 'fs';
import path from 'path';

import { WorkspaceSnapshot } from './types';

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m|\u001b\][^\u0007]*\u0007|\u001b[PX^_][^\u001b]*\u001b\\|\u001b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function truncate(text: string, max = 600): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function extractJsonBlock<T>(raw: string): T {
  const cleaned = stripAnsi(normalizeLineEndings(raw)).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : cleaned;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
  }

  throw new Error('Failed to extract valid JSON from model output.');
}

export function normalizeMarkdownDocument(raw: string): string {
  const cleaned = stripAnsi(normalizeLineEndings(raw)).trim();
  if (!cleaned) {
    return cleaned;
  }

  const outerFenced = extractOuterMarkdownFence(cleaned);
  return outerFenced || cleaned;
}

function extractOuterMarkdownFence(input: string): string | null {
  const lines = input.split('\n');
  const firstFenceIndex = lines.findIndex(line => /^```(?:markdown|md)?\s*$/i.test(line.trim()));
  const lastFenceIndex = findLastIndex(lines, line => /^```\s*$/.test(line.trim()));

  if (firstFenceIndex !== -1 && lastFenceIndex > firstFenceIndex) {
    const nearStart = firstFenceIndex <= 2;
    const nearEnd = lines.length - 1 - lastFenceIndex <= 2;
    if (nearStart && nearEnd) {
      const body = lines.slice(firstFenceIndex + 1, lastFenceIndex).join('\n').trim();
      if (body) {
        return body;
      }
    }
  }

  const openMatch = /```(?:markdown|md)?\s*\n/i.exec(input);
  const closingFenceIndex = input.search(/\n```\s*$/);
  if (!openMatch || closingFenceIndex === -1 || closingFenceIndex <= openMatch.index) {
    return null;
  }

  const prefix = input.slice(0, openMatch.index).trim();
  const suffix = input.slice(closingFenceIndex + 4).trim();
  const nearStart = openMatch.index <= 400 && prefix.split('\n').filter(Boolean).length <= 3;
  const nearEnd = suffix.split('\n').filter(Boolean).length <= 2;
  if (!nearStart || !nearEnd) {
    return null;
  }

  const body = input.slice(openMatch.index + openMatch[0].length, closingFenceIndex).trim();
  return body || null;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function captureWorkspaceSnapshot(rootDir: string, startedAt = new Date().toISOString()): WorkspaceSnapshot {
  const files: Record<string, number> = {};

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      if (['.git', '.aegis', '.aegisflow', 'node_modules', 'dist', 'build'].includes(entry)) {
        continue;
      }

      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      files[path.relative(rootDir, fullPath)] = stat.mtimeMs;
    }
  };

  walk(rootDir);

  return {
    capturedAt: startedAt,
    files,
  };
}

export function diffSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  const changed: string[] = [];

  for (const [file, mtime] of Object.entries(after.files)) {
    if (!before.files[file] || before.files[file] !== mtime) {
      changed.push(file);
    }
  }

  return changed.sort();
}

export function parseDelimitedList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : [];
}

export function nowIso(): string {
  return new Date().toISOString();
}
