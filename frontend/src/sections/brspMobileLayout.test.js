import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const component = await readFile(new URL('./BrspSection.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('./BrspSection.css', import.meta.url), 'utf8');

test('mobile meeting selection reuses the existing meeting selection handler', () => {
  assert.match(component, /className="brsp-meeting-select"/);
  assert.match(component, /onChange=\{event => selectMeeting\(meetings\.find\(item => item\.id === Number\(event\.target\.value\)\)\)\}/);
  assert.match(styles, /\.brsp-meeting-select-wrap \{ display: none;/);
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.brsp-meeting-select-wrap \{ display: block;/);
});

test('mobile topics scroll vertically and optional details are hidden without deleting them', () => {
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.brsp-topic-list \{[^}]*overflow-y: auto;/);
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.brsp-topic-list \.brsp-list-item small \{ display: none;/);
  assert.match(styles, /@media \(max-width: 800px\)[\s\S]*\.brsp-meeting-note \{ display: none;/);
  assert.match(component, /className="brsp-meeting-note"/);
});
