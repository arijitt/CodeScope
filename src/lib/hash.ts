// Tiny stable string fingerprint used to detect "code changed since visualize".
// djb2 — http://www.cse.yorku.ca/~oz/hash.html — fast, good distribution for
// short-to-medium strings, no crypto needed.
export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // (h * 33) XOR char
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // Force unsigned 32-bit and base36 for compactness.
  return (h >>> 0).toString(36);
}
