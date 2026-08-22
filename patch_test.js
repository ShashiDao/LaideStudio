const { Window } = require('happy-dom');
const window = new Window();
const parser = new window.DOMParser();
const doc = parser.parseFromString('<script>var a = "</script>";</script>', 'text/html');
console.log(doc.documentElement.outerHTML);
