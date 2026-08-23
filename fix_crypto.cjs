const fs = require('fs');

function replaceImport(file, importStr, importPath) {
  let content = fs.readFileSync(file, 'utf8');
  // First, extract the imported names
  const match = content.match(new RegExp(`import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${importPath}['"];`));
  if (!match) return;
  
  // Replace the import line. But keep type imports!
  const names = match[1].split(',').map(s => s.trim()).filter(s => s);
  const types = names.filter(n => n.startsWith('type '));
  const values = names.filter(n => !n.startsWith('type '));
  
  if (types.length > 0) {
    content = content.replace(match[0], `import type { ${types.map(t => t.replace('type ', '')).join(', ')} } from '${importPath}';`);
  } else {
    content = content.replace(match[0], '');
  }

  // Now we need to inject the dynamic import at the start of functions that use these values
  // This is too complex to do perfectly with regex for all files. I will just do it file by file.
  return { content, values };
}

