const fs = require('fs');

let content = fs.readFileSync('src/components/PreviewPanel.tsx', 'utf-8');

// Replace previewUrl with previewHtml
content = content.replace(/const \[previewUrl, setPreviewUrl\] = useState<string \| null>\(null\);/, 'const [previewHtml, setPreviewHtml] = useState<string | null>(null);');
content = content.replace(/setPreviewUrl\(null\)/g, 'setPreviewHtml(null)');
content = content.replace(/setPreviewUrl\(htmlUrl\)/g, 'setPreviewHtml(finalHtml)');
content = content.replace(/previewUrl/g, 'previewHtml');

// Change iframe to use srcDoc
content = content.replace(/src=\{previewHtml\}/, 'srcDoc={previewHtml}');

// Remove htmlBlob creation
content = content.replace(/const htmlBlob = new Blob\(\[finalHtml\], \{ type: 'text\/html' \}\);\s*const htmlUrl = URL\.createObjectURL\(htmlBlob\);\s*objectUrls\.current\.push\(htmlUrl\);/g, '');

// Remove objectUrls
content = content.replace(/const objectUrls = useRef<string\[\]>\(\[\]\);\s*/, '');
content = content.replace(/objectUrls\.current\.forEach\(url => URL\.revokeObjectURL\(url\)\);\s*objectUrls\.current = \[\];/g, '');

// Fix links in static fallback
const linksReplaceRegex = /const links = doc\.querySelectorAll\('link\[rel="stylesheet"\]'\);\s*links\.forEach\(link => \{([\s\S]*?)const blob = new Blob\(\[targetFile\.content\], \{ type: 'text\/css' \}\);\s*const url = URL\.createObjectURL\(blob\);\s*objectUrls\.current\.push\(url\);\s*link\.setAttribute\('href', url\);\s*\}\s*\}\s*\}\);/g;

content = content.replace(linksReplaceRegex, (match, before) => {
  return `const links = doc.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {${before}const styleEl = doc.createElement('style');
              styleEl.textContent = targetFile.content;
              link.replaceWith(styleEl);
            }
          }
        });`;
});

// Fix scripts in static fallback
const scriptsReplaceRegex = /const scripts = doc\.querySelectorAll\('script\[src\]'\);\s*scripts\.forEach\(script => \{([\s\S]*?)const sanitizedContent = escapeScriptClosingTags\(targetFile\.content\);\s*const blob = new Blob\(\[sanitizedContent\], \{ type: mimeType \}\);\s*const url = URL\.createObjectURL\(blob\);\s*objectUrls\.current\.push\(url\);\s*script\.setAttribute\('src', url\);\s*\}\s*\}\s*\}\);/g;

content = content.replace(scriptsReplaceRegex, (match, before) => {
  return `const scripts = doc.querySelectorAll('script[src]');
        scripts.forEach(script => {${before}const inlineScript = doc.createElement('script');
              if (script.getAttribute('type') === 'module') {
                inlineScript.setAttribute('type', 'module');
              }
              const sanitizedContent = escapeScriptClosingTags(targetFile.content);
              inlineScript.textContent = sanitizedContent;
              script.replaceWith(inlineScript);
            }
          }
        });`;
});

fs.writeFileSync('src/components/PreviewPanel.tsx', content);
