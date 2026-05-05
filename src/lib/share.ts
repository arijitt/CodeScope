import LZString from 'lz-string';
import type { FileNode } from '../types';

interface SharePayload {
  v: 1;
  files: FileNode[];
  activeId: string | null;
}

const MAX_URL_LEN = 6000;

export function encodeWorkspace(files: FileNode[], activeId: string | null): string {
  const payload: SharePayload = { v: 1, files, activeId };
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeWorkspace(s: string): SharePayload | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(s);
    if (!json) return null;
    const data = JSON.parse(json);
    if (data?.v !== 1 || !Array.isArray(data.files)) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildShareUrl(files: FileNode[], activeId: string | null): { url: string; tooLarge: boolean } {
  const s = encodeWorkspace(files, activeId);
  const url = `${location.origin}${location.pathname}?s=${s}`;
  return { url, tooLarge: url.length > MAX_URL_LEN };
}

export function readShareFromUrl(): SharePayload | null {
  const params = new URLSearchParams(location.search);
  const s = params.get('s');
  return s ? decodeWorkspace(s) : null;
}

export function clearShareFromUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('s');
  history.replaceState({}, '', url.toString());
}
