const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.tsx')) results.push(file);
  });
  return results;
}
const files = walk('d:/Projects/Autopilot Mobile app/fms--native-/saas_mobile/components');
let fixed = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/\/>`n\s*showsVerticalScrollIndicator=\{false\}/g, '/>}\n          showsVerticalScrollIndicator={false}');
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    fixed++;
    console.log('Fixed', file);
  }
});
console.log('Total fixed:', fixed);
