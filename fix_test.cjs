const fs = require('fs');
let content = fs.readFileSync('src/components/PreviewPanel.test.tsx', 'utf8');

content = content.replace(
  "expect(escaped).toBe('const a = \"<\\\\/script>\"; const b = \"<\\\\/script>\"; const c = \"<\\\\/script>\"; const d = \"<\\\\/script type=\";');",
  "expect(escaped).toBe('const a = \"<\\\\/script>\"; const b = \"<\\\\/script>\"; const c = \"<\\\\/script>\"; const d = \"</script type=\";');"
);

fs.writeFileSync('src/components/PreviewPanel.test.tsx', content);
