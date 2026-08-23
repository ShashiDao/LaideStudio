const fs = require('fs');
let gc = fs.readFileSync('src/services/github/githubClient.ts', 'utf8');
gc = gc.replace(
  "export async function createGithubClient(keys: KeyMaterial): Promise<GithubClient> {",
  "export async function createGithubClient(keys: KeyMaterial): Promise<GithubClient> {\n  const { decryptData } = await import('../crypto');"
);
fs.writeFileSync('src/services/github/githubClient.ts', gc);
