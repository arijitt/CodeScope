export function uid(): string {
  // Short, URL-friendly unique ID
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
