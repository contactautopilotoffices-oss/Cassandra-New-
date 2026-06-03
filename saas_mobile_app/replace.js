const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git') && !file.includes('.expo')) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(process.cwd());
let modifiedFilesCount = 0;
let totalReplaced = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const regex = /fontFamily\s*:\s*[^,}]+,?\r?\n?/g;
  
  if (regex.test(content)) {
    const matches = content.match(regex);
    const newContent = content.replace(regex, '');
    fs.writeFileSync(file, newContent, 'utf8');
    modifiedFilesCount++;
    totalReplaced += matches.length;
    console.log(`Updated: ${file.replace(process.cwd(), '')}`);
  }
});

console.log(`\nSuccessfully removed fontFamily usages from ${modifiedFilesCount} files.`);
console.log(`Total usages stripped: ${totalReplaced}`);
