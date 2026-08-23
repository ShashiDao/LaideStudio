const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace("import { decryptData } from './services/crypto';\n", '');
content = content.replace(
`        decryptData(keys.aesKey, enc).then(str => {
          try {
            setMcpServers(JSON.parse(str));
          } catch (e) {
            console.error('Failed to parse MCP servers', e);
          }
        }).catch(e => console.error('Failed to decrypt MCP servers', e));`,
`        import('./services/crypto').then(({ decryptData }) => {
          decryptData(keys.aesKey, enc).then(str => {
            try {
              setMcpServers(JSON.parse(str));
            } catch (e) {
              console.error('Failed to parse MCP servers', e);
            }
          }).catch(e => console.error('Failed to decrypt MCP servers', e));
        }).catch(e => console.error('Failed to load crypto module', e));`
);
fs.writeFileSync('src/App.tsx', content);
