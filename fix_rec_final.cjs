const fs = require('fs');
let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');

rec = rec.replace(
  "import {\n  deriveKeys,\n  generateVerifier,\n  verifyPassphrase,\n  arrayBufferToBase64,\n  base64ToArrayBuffer\n} from './crypto';",
  ""
);

rec = rec.replace(
  "import { \n  deriveKeys, \n  generateVerifier, \n  verifyPassphrase, \n  arrayBufferToBase64, \n  base64ToArrayBuffer \n} from './crypto';",
  ""
);

rec = rec.replace(/import \{[\s\S]*?\} from '\.\/crypto';/, '');

fs.writeFileSync('src/services/recovery.ts', rec);
