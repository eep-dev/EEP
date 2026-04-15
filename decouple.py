import os
import re

REPLACEMENTS = [
    (r"Copyright 2026 more\.md", "Copyright 2026 EEP Contributors"),
    (r"hello@more\.md", "security@eep.dev"),
    (r"MoreMDEntityCredential", "EEPEntityCredential"),
    (r"more-md SDK", "example SDK"),
    (r"did:web:api\.more\.md", "did:web:api.example.com"),
    (r"did:web:more\.md", "did:web:example.com"),
    (r"https://api\.more\.md", "https://api.example.com"),
    (r"wss://api\.more\.md", "wss://api.example.com"),
    (r"https://pay\.more\.md", "https://pay.example.com"),
    (r"md\.more\.entity", "com.example.entity"),
    (r"md\.more\.", "com.example."),
    (r"more\.md", "example.com")
]

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return # Skip binary files

    original = content
    for pattern, replacement in REPLACEMENTS:
        content = re.sub(pattern, replacement, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated: {filepath}")

def main():
    for root, dirs, files in os.walk('.'):
        # Skip node_modules, .git, and build artifacts
        dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules', 'dist', 'build', '__pycache__', '.pytest_cache', '.vitest_cache', 'tests-cache']]
        for file in files:
            if file == 'decouple.py':
                continue
            filepath = os.path.join(root, file)
            # only process text files
            if filepath.endswith(('.ts', '.js', '.json', '.md', '.py', '.sh', '.tex', '.yml', '.yaml')):
                process_file(filepath)

if __name__ == '__main__':
    main()
