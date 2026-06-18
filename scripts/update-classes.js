/* eslint-disable @typescript-eslint/no-require-imports -- one-off Node codemod (CJS) */
const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /ed-card/g, to: 'glass-panel' },
  { from: /ed-faint/g, to: 'text-muted-foreground' },
  { from: /ed-soft/g, to: 'text-muted-foreground' },
  { from: /ed-accent/g, to: 'text-primary' },
  { from: /ed-page/g, to: 'bg-background text-foreground' },
  { from: /bg-white\/90/g, to: 'bg-card/90' },
  { from: /bg-stone-100/g, to: 'bg-muted' },
  { from: /border-black\/5/g, to: 'border-border' },
  { from: /ring-black\/10/g, to: 'ring-border' },
  { from: /var\(--bg-card\)/g, to: 'var(--card)' },
  { from: /var\(--ink\)/g, to: 'var(--foreground)' },
  { from: /var\(--hairline\)/g, to: 'var(--border)' },
  { from: /var\(--accent\)/g, to: 'var(--primary)' }
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      for (const { from, to } of replacements) {
        content = content.replace(from, to);
      }
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, '..', 'src', 'components'));
processDirectory(path.join(__dirname, '..', 'src', 'app'));

console.log('Done!');
