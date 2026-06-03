const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(process.cwd());
let modifiedFiles = [];
let totalReplaced = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /fontFamily\s*:\s*.*?,\r?\n?/g;
  if (regex.test(content)) {
    const matches = content.match(regex);
    modifiedFiles.push(file.replace(process.cwd(), ''));
    totalReplaced += matches.length;
  }
});

console.log(`[DRY-RUN] Will remove fontFamily usages from ${modifiedFiles.length} files.`);
console.log(`[DRY-RUN] Total usages found: ${totalReplaced}`);
console.log(`\nFiles affected:\n` + modifiedFiles.join('\n'));
