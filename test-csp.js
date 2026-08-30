const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
if (!content.includes('Content-Security-Policy')) {
  console.log('CSP missing in index.html');
  process.exit(1);
}
console.log('CSP check passed');
