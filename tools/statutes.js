#!/usr/bin/env node
/* The statutes the pages quote, fetched from the e-Gov law API (v1, public, no key), and the GitHub policy files the
 * pages name, fetched from github/site-policy.
 *
 * - Each article is fetched from https://laws.e-gov.go.jp/api/1/articles;lawId=<id>;article=<n>. Its text is reduced to
 *   plain characters (ruby readings and tags dropped, white space collapsed), the same reduction Sophaxis uses, and its
 *   SHA-256 is compared with the one recorded in verification/statutes.json. With `items`, only those items are kept.
 * - Each policy file is read at the latest commit that touched it. The commit is compared with the one recorded, and
 *   every recorded phrase must still occur in the file.
 *
 *   node tools/statutes.js            compare only; exit 1 on a difference
 *   node tools/statutes.js --record   write the fetched texts, hashes, commits and the date (JST) into verification/
 *
 * On the schedule (statutes.yml) a difference opens one issue with fixed words, or updates it; when everything matches
 * again, it closes. Nothing is written to the repository by the workflow. Recording is done by a commit in a pull request.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'verification', 'statutes.json');
const TEXTS = path.join(ROOT, 'verification', 'statutes-texts.json');
const UA = 'research-collaboration statutes watch (+https://github.com/cpsbvbng26-dotcom/research-collaboration)';
const MARK = '<!-- statutes-watch -->';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const plain = (x) => x.replace(/<Rt>[^<]*<\/Rt>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sha = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/* Pure: the plain text of an article answer, or of some of its items. */
function articleText(xml, num, items) {
  const m = new RegExp('<Article[^>]*\\sNum="' + num + '"[^>]*>[\\s\\S]*?</Article>').exec(xml);
  if (!m) return null;
  if (!items) return plain(m[0]);
  const parts = items.map((n) => (new RegExp('<Item[^>]*\\sNum="' + n + '"[^>]*>[\\s\\S]*?</Item>').exec(m[0]) || [null])[0]);
  return parts.every(Boolean) ? parts.map(plain).join('\n') : null;
}

async function get(url, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers), signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.text();
      if (r.status < 500 && r.status !== 429) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === 2) throw e; }
    await sleep(4000 * (i + 1));
  }
  throw new Error('no answer');
}

async function main() {
  const record = process.argv.includes('--record');
  const conf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const texts = fs.existsSync(TEXTS) ? JSON.parse(fs.readFileSync(TEXTS, 'utf8')) : {};
  const results = [];
  for (const e of conf.statutes) {
    const key = e.law + ' ' + e.label;
    const url = 'https://laws.e-gov.go.jp/api/1/articles;lawId=' + e.law_id + ';article=' + e.article;
    try {
      const xml = await get(url);
      await sleep(1200);
      const code = (/<Code>(\d+)<\/Code>/.exec(xml) || [])[1];
      const text = code === '0' ? articleText(xml, e.article, e.items) : null;
      if (text === null) { results.push({ key, state: 'missing' }); continue; }
      const h = sha(text);
      if (record) { e.sha256 = h; texts[key] = text; }
      results.push({ key, state: h === e.sha256 ? 'same' : 'changed', text });
    } catch (err) { results.push({ key, state: 'failed', note: String(err.message || err) }); }
  }
  const auth = process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};
  for (const p of conf.policies) {
    const key = p.name;
    try {
      const list = JSON.parse(await get('https://api.github.com/repos/' + p.repo + '/commits?per_page=1&path=' + encodeURIComponent(p.path), auth));
      const c = list[0] && list[0].sha;
      const body = await get('https://raw.githubusercontent.com/' + p.repo + '/' + c + '/' + p.path);
      const flat = body.replace(/\s+/g, ' ');
      const lost = p.phrases.filter((x) => flat.indexOf(x) < 0);
      if (record && lost.length === 0) p.commit = c;
      results.push({ key, state: lost.length ? 'missing' : c === p.commit ? 'same' : 'changed', note: lost.length ? lost.join(' / ') : c });
    } catch (err) { results.push({ key, state: 'failed', note: String(err.message || err) }); }
  }
  if (record) {
    conf.fetched = today();
    fs.writeFileSync(FILE, JSON.stringify(conf, null, 2) + '\n');
    fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 2) + '\n');
  }
  for (const r of results) console.log(r.state.padEnd(8) + ' ' + r.key + (r.note && r.state !== 'same' ? '  (' + r.note + ')' : ''));
  const odd = results.filter((r) => r.state !== 'same');
  console.log('\n' + results.length + ' checked, ' + odd.length + ' differ from the record.');
  if (['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME) && process.env.GITHUB_TOKEN && !record) await report(odd);
  if (odd.length && !record) process.exit(1);
}

/* One issue with fixed words. It lists the keys only, never a fetched text. */
async function report(odd) {
  const repo = process.env.GITHUB_REPOSITORY;
  const H = { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': UA };
  const call = async (method, url, body) => {
    const r = await fetch('https://api.github.com' + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(method + ' ' + url + ' ' + r.status);
    return r.json();
  };
  const open = (await call('GET', '/repos/' + repo + '/issues?state=open&labels=' + encodeURIComponent('法令') + '&per_page=50'))
    .find((i) => !i.pull_request && String(i.body || '').includes(MARK));
  if (!odd.length) {
    if (open) {
      await call('POST', '/repos/' + repo + '/issues/' + open.number + '/comments', { body: today() + ' の確認で、すべて記した値と同じでした。閉じます。' });
      await call('PATCH', '/repos/' + repo + '/issues/' + open.number, { state: 'closed', state_reason: 'completed' });
    }
    return;
  }
  const body = MARK + '\n' + today() + ' の確認で、次のものが記した値と違いました。\n\n'
    + odd.map((r) => '- ' + r.key + '（' + r.state + '）').join('\n')
    + '\n\n規程が引く文は、記し直すまで、記した日の文のままです。';
  if (open) await call('PATCH', '/repos/' + repo + '/issues/' + open.number, { body });
  else await call('POST', '/repos/' + repo + '/issues', { title: '規程が引く条文か規約が変わったかもしれない', body, labels: ['法令'] });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
module.exports = { plain, sha, articleText };
