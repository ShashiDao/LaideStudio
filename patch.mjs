import { Window } from 'happy-dom';
const window = new Window();
const parser = new window.DOMParser();
const doc = parser.parseFromString('<script>var a = "</script>";</script>', 'text/html');
const scripts = doc.querySelectorAll('script:not([src])');
scripts.forEach(script => {
  console.log("Before:", JSON.stringify(script.textContent));
  script.textContent = script.textContent.replace(/<\/script/gi, '<\\/script');
  console.log("After:", JSON.stringify(script.textContent));
});
console.log("Outer:", doc.documentElement.outerHTML);
