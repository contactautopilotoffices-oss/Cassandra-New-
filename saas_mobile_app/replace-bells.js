const fs = require('fs');
const path = require('path');

const dashboardsDir = path.join(__dirname, 'components', 'dashboard');
const files = fs.readdirSync(dashboardsDir).filter(f => f.endsWith('.tsx'));

let modifiedCount = 0;

for (const file of files) {
  const filePath = path.join(dashboardsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if it has a dummy bell
  if (!content.includes('Notifications coming soon!')) continue;

  // Import NotificationBell if not present
  if (!content.includes('NotificationBell')) {
    // Find a good place to insert import. Usually near the top after imports.
    const importStr = `import NotificationBell from '@/components/dashboard/NotificationBell';\n`;
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfLine = content.indexOf('\n', lastImportIndex);
      content = content.substring(0, endOfLine + 1) + importStr + content.substring(endOfLine + 1);
    } else {
      content = importStr + content;
    }
  }

  // Replace dummy bell
  const dummyBellRegex1 = /<TouchableOpacity[^>]*?onPress={\(\) =>\s*\{?\s*Alert\.alert\('Notifications',\s*'Notifications coming soon!'\);?\s*\}?}[^>]*>\s*<Ionicons name="notifications-outline" size={(\d+)} color={([^}]+)} \/>\s*<\/TouchableOpacity>/gs;
  
  const dummyBellRegex2 = /<TouchableOpacity[^>]*?onPress={\(\) =>\s*Alert\.alert\('Notifications',\s*'Notifications coming soon!'\)}[^>]*>\s*<Ionicons name="notifications-outline" size={(\d+)} color={([^}]+)} \/>\s*<\/TouchableOpacity>/gs;

  let replaced = false;

  content = content.replace(dummyBellRegex1, (match, size, color) => {
    replaced = true;
    return `<NotificationBell style={styles.bellButton} iconSize={${size}} iconColor={${color}} />`;
  });

  content = content.replace(dummyBellRegex2, (match, size, color) => {
    replaced = true;
    return `<NotificationBell style={styles.bellButton} iconSize={${size}} iconColor={${color}} />`;
  });

  if (replaced) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    console.log('Modified', file);
  }
}

console.log('Modified files:', modifiedCount);
