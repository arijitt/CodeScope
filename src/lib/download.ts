import JSZip from 'jszip';
import type { FileNode } from '../types';

export function downloadFile(file: FileNode) {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, file.path.split('/').pop() ?? 'file.txt');
}

export async function downloadWorkspaceZip(files: FileNode[], zipName = 'workspace.zip') {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, zipName);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
