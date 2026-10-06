import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeCss } from '../src/css';

const out = join(__dirname, '..', 'theme.css');
writeFileSync(out, themeCss());
console.log(`Wrote ${out}`);
