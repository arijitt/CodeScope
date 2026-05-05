import type { LanguageMeta, LanguageId } from '../types';

export const LANGUAGES: LanguageMeta[] = [
  {
    id: 'javascript', label: 'JavaScript', monacoId: 'javascript',
    pistonRuntime: 'javascript', wandboxCompiler: 'nodejs-20.17.0',
    defaultFilename: 'main.js', fileExtension: 'js',
    runnable: true,
    starterCode: `console.log("Hello from JavaScript!");\n`,
  },
  {
    id: 'typescript', label: 'TypeScript', monacoId: 'typescript',
    pistonRuntime: 'typescript', wandboxCompiler: 'typescript-5.6.2',
    defaultFilename: 'main.ts', fileExtension: 'ts',
    runnable: true,
    starterCode: `const greet = (name: string): string => \`Hello, \${name}!\`;\nconsole.log(greet("TypeScript"));\n`,
  },
  {
    id: 'python', label: 'Python', monacoId: 'python',
    pistonRuntime: 'python', wandboxCompiler: 'cpython-3.13.8',
    defaultFilename: 'main.py', fileExtension: 'py',
    runnable: true,
    starterCode: `print("Hello from Python!")\n`,
  },
  {
    id: 'java', label: 'Java', monacoId: 'java',
    pistonRuntime: 'java', wandboxCompiler: 'openjdk-jdk-22+36',
    defaultFilename: 'Main.java', fileExtension: 'java',
    runnable: true,
    // Wandbox saves the source as prog.java, so the entry class cannot be
    // declared `public` (filename mismatch). Use a package-private class.
    starterCode: `class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}\n`,
  },
  {
    id: 'cpp', label: 'C++', monacoId: 'cpp',
    pistonRuntime: 'c++', wandboxCompiler: 'gcc-13.2.0',
    defaultFilename: 'main.cpp', fileExtension: 'cpp',
    runnable: true,
    starterCode: `#include <iostream>\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}\n`,
  },
  {
    id: 'csharp', label: 'C#', monacoId: 'csharp',
    pistonRuntime: 'csharp.net', wandboxCompiler: 'mono-6.12.0.199',
    defaultFilename: 'Program.cs', fileExtension: 'cs',
    runnable: true,
    starterCode: `using System;\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello from C#!");\n    }\n}\n`,
  },
  {
    id: 'go', label: 'Go', monacoId: 'go',
    pistonRuntime: 'go', wandboxCompiler: 'go-1.23.2',
    defaultFilename: 'main.go', fileExtension: 'go',
    runnable: true,
    starterCode: `package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello from Go!")\n}\n`,
  },
  {
    id: 'rust', label: 'Rust', monacoId: 'rust',
    pistonRuntime: 'rust', wandboxCompiler: 'rust-1.82.0',
    defaultFilename: 'main.rs', fileExtension: 'rs',
    runnable: true,
    starterCode: `fn main() {\n    println!("Hello from Rust!");\n}\n`,
  },
  {
    id: 'ruby', label: 'Ruby', monacoId: 'ruby',
    pistonRuntime: 'ruby', wandboxCompiler: 'ruby-3.4.9',
    defaultFilename: 'main.rb', fileExtension: 'rb',
    runnable: true,
    starterCode: `puts "Hello from Ruby!"\n`,
  },
  {
    id: 'php', label: 'PHP', monacoId: 'php',
    pistonRuntime: 'php', wandboxCompiler: 'php-8.3.12',
    defaultFilename: 'main.php', fileExtension: 'php',
    runnable: true,
    starterCode: `<?php\necho "Hello from PHP!\\n";\n`,
  },
  {
    id: 'html', label: 'HTML', monacoId: 'html',
    pistonRuntime: '', wandboxCompiler: '',
    defaultFilename: 'index.html', fileExtension: 'html',
    runnable: false,
    starterCode: `<!doctype html>\n<html>\n  <head><title>Hello</title></head>\n  <body><h1>Hello, world!</h1></body>\n</html>\n`,
  },
  {
    id: 'css', label: 'CSS', monacoId: 'css',
    pistonRuntime: '', wandboxCompiler: '',
    defaultFilename: 'style.css', fileExtension: 'css',
    runnable: false,
    starterCode: `body {\n  font-family: sans-serif;\n  color: #333;\n}\n`,
  },
  {
    id: 'json', label: 'JSON', monacoId: 'json',
    pistonRuntime: '', wandboxCompiler: '',
    defaultFilename: 'data.json', fileExtension: 'json',
    runnable: false,
    starterCode: `{\n  "hello": "world"\n}\n`,
  },
  {
    id: 'markdown', label: 'Markdown', monacoId: 'markdown',
    pistonRuntime: '', wandboxCompiler: '',
    defaultFilename: 'README.md', fileExtension: 'md',
    runnable: false,
    starterCode: `# Hello\n\nWrite some **markdown** here.\n`,
  },
  {
    id: 'sql', label: 'SQL', monacoId: 'sql',
    pistonRuntime: 'sqlite3', wandboxCompiler: 'sqlite-3.46.1',
    defaultFilename: 'query.sql', fileExtension: 'sql',
    runnable: true,
    starterCode: `SELECT 'Hello from SQL!' AS greeting;\n`,
  },
];

const BY_ID = new Map<LanguageId, LanguageMeta>(LANGUAGES.map(l => [l.id, l]));

export function getLanguage(id: LanguageId): LanguageMeta {
  const lang = BY_ID.get(id);
  if (!lang) throw new Error(`Unknown language: ${id}`);
  return lang;
}

export function detectLanguageFromFilename(filename: string): LanguageId {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, LanguageId> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    html: 'html', htm: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql',
  };
  return map[ext] ?? 'javascript';
}
