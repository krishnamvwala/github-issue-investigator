import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'data.js']) {
  await cp(new URL('../' + name, import.meta.url), new URL('../dist/' + name, import.meta.url));
}
console.log('Dashboard built: dashboard/dist');
