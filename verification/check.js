#!/usr/bin/env node
/* research-collaboration の検査。
 *
 *   node verification/check.js           どの検査も通るか
 *   node verification/check.js --break   どの検査も、壊せば落ちるか（壊し方の無い検査があっても落ちる）
 *
 * 検査はどれも、ファイルの中身の表（パス → 文字列）を受け取り、見つけた問題の一覧を返す純粋な関数である。
 * --break は、表の写しを壊して同じ関数に渡し、問題が一つ以上返ることを確かめる。網には出ない。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules']);
function load() {
  const F = new Map();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else F.set(r, fs.readFileSync(path.join(dir, e.name), 'utf8'));
    }
  };
  walk(ROOT, '');
  return F;
}
const sha = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
const json = (F, p) => { try { return JSON.parse(F.get(p)); } catch (e) { return null; } };
const REPO = 'https://github.com/cpsbvbng26-dotcom/research-collaboration';

/* ------------------------------------------------------------ 何を散文と見るか */

const PAGES = (F) => [...F.keys()].filter((p) => /^(README|TOPICS)(\.en)?\.md$/.test(p) || /^policies\/[a-z-]+(\.en)?\.md$/.test(p)).sort();
const PROSE = (F) => PAGES(F).concat([...F.keys()].filter((p) => /^docs\/.+\.md$/.test(p)).sort());
const FORMS = ['.github/ISSUE_TEMPLATE/collaboration.yml', '.github/ISSUE_TEMPLATE/request.yml', '.github/ISSUE_TEMPLATE/rights.yml'];
const ALL_FORMS = FORMS.concat(['.github/ISSUE_TEMPLATE/error-report.yml']);
const isEn = (p) => /\.en\.md$/.test(p);

/* 様式の、人が読む文だけ。鍵と型の行を落とす。 */
function formText(t) {
  return String(t || '').split('\n').map((l) => l.replace(/^\s*(?:-\s+)?(?:label|description|name|title|about|value):\s*\|?\s*/, '').replace(/^\s*-\s+/, ''))
    .filter((l, i, a) => !/^\s*(?:type|id|required|validations|attributes|options|body|labels|blank_issues_enabled|contact_links|url):/.test(String(t).split('\n')[i]))
    .join('\n');
}

/* 「」の中を、入れ子ごと取り出す。[{ at, text }] */
function quotes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '「') continue;
    let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '「') d++; else if (s[j] === '」' && --d === 0) break; }
    if (j >= s.length) { out.push({ at: i, text: null }); break; }
    out.push({ at: i, text: s.slice(i + 1, j) });
    i = j;
  }
  return out;
}
const stripQuotes = (s) => { let o = '', last = 0; for (const q of quotes(s)) { if (q.text === null) break; o += s.slice(last, q.at) + '「」'; last = q.at + q.text.length + 2; } return o + s.slice(last); };
/* 囲み・コード・URL・リンクの行き先・引用を落とした文。 */
function bare(s) {
  return stripQuotes(String(s).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '``').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ''));
}

/* ------------------------------------------------------------ 条の参照 */

const JA_LAWS = ['個人情報保護法', '著作権法', '民法', '労働基準法', '労働契約法'];
const EN_LAWS = { 'Act on the Protection of Personal Information': '個人情報保護法', 'Copyright Act': '著作権法', 'Civil Code': '民法', 'Labour Standards Act': '労働基準法', 'Labour Contracts Act': '労働契約法' };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };
const JA_REF = new RegExp('(' + JA_LAWS.join('|') + ')?第(\\d+)条(?:第(\\d+)項)?(?:第(\\d+)号)?', 'g');
const EN_REF = new RegExp('Article (\\d+)(?:\\((\\d+)\\))?(?:\\(([ivx]+)\\))?(?: of (?:the |Japan\'s )?(' + Object.keys(EN_LAWS).join('|') + '))?', 'g');
const SEC_REF = /(?:利用規約 |Section )([A-Z]\.\d+)/g;

/* 一つの頁の、行ごとの参照。見出しが法令を決め、行の中の名がそれに勝つ。 */
function refs(text, en) {
  const out = [];
  let law = null;
  text.split('\n').forEach((line, n) => {
    if (/^#/.test(line)) {
      const h = en ? Object.keys(EN_LAWS).find((k) => line.includes(k)) : JA_LAWS.find((k) => line.includes(k));
      law = h ? (en ? EN_LAWS[h] : h) : (/GitHub/.test(line) ? null : law);
      if (/^## /.test(line) && !h) law = null;
      return;
    }
    const re = new RegExp(en ? EN_REF.source : JA_REF.source, 'g');
    let m, lineLaw = law;
    while ((m = re.exec(line))) {
      const named = en ? (m[4] ? EN_LAWS[m[4]] : null) : m[1];
      if (named) lineLaw = named;
      const item = en ? (m[3] ? ROMAN[m[3]] : null) : (m[4] ? Number(m[4]) : null);
      out.push({ line: n, at: m.index, end: m.index + m[0].length, kind: 'article', law: named || lineLaw, article: Number(en ? m[1] : m[2]), item });
    }
    let s; const sr = new RegExp(SEC_REF.source, 'g');
    while ((s = sr.exec(line))) out.push({ line: n, at: s.index, end: s.index + s[0].length, kind: 'section', section: s[1] });
  });
  return out;
}
function statuteKey(S, r) {
  if (!r.law) return null;
  const withItem = r.law + ' 第' + r.article + '条第1項第' + r.item + '号';
  if (r.item && S.statutes.some((e) => e.law + ' ' + e.label === withItem)) return withItem;
  const k = r.law + ' 第' + r.article + '条';
  return S.statutes.some((e) => e.law + ' ' + e.label === k) ? k : null;
}

/* ------------------------------------------------------------ 使わない語（符号にして置く） */

const dec = (b) => Buffer.from(b, 'base64').toString('utf8');
/* 運営者のほかの創作の場の名。書けば、この検査自身が掛かるので符号にしてある。 */
const OTHER_PLACE = ['TnVzcXVhbWE=', '44OM44K544Kv44Kh44Oe', '54Sh5L2V5pyJ6aiO5aOr546L5Zu9'].map(dec);
/* 大学の名。 */
const SCHOOL = [new RegExp(dec('WkVO') + '\\s*(?:' + dec('5aSn5a2m') + '|University)', 'i')];
/* 自称の肩書き（cpsbvbng26-dotcom の check_text.js と同じ語）。 */
const TITLES = ['独立研究者', 'Independent Researcher'];

/* ------------------------------------------------------------ 検査 */

const CONSENT_JA = 'この issue の題と本文を、運営者が Claude（Anthropic、米国）に渡すことに同意します。';
const CONSENT_EN = 'I consent to the operator giving the title and text of this issue to Claude (Anthropic, United States).';
const RULE17 = 'I consent to the operator giving the title and text of this issue to Claude';

const CHECKS = [];
const check = (name, fn) => CHECKS.push({ name, fn });

check('正本の写しが、記した sha256 と同じ', (F) => {
  const C = json(F, 'verification/copies.json');
  if (!C) return ['copies.json が読めない'];
  const bad = [];
  for (const [f, h] of Object.entries(C['写し'])) if (!F.has(f) || sha(F.get(f)) !== h) bad.push(f);
  if (Object.keys(C['写し']).length !== 4) bad.push('写しの数');
  return bad;
});

check('どの様式も、決まりの文の同意の欄を持つ（このリポジトリの様式は任意、誤りの知らせは正本のとおり必須）', (F) => {
  const bad = [];
  for (const f of ALL_FORMS) {
    const t = F.get(f) || '';
    const want = (f.endsWith('error-report.yml') ? 'true' : 'false');
    const i = t.indexOf('- label: ' + CONSENT_JA + ' / ' + CONSENT_EN);
    if (i < 0) { bad.push(f + '：同意の欄の文'); continue; }
    if (!/^\s*required: (true|false)/.test(t.slice(t.indexOf('\n', i) + 1)) || RegExp.$1 !== want) bad.push(f + '：required');
    if (!t.includes('個人情報保護法第') || !/第 ?28 ?条/.test(t) || !t.includes('Article 28')) bad.push(f + '：第28条');
    if (!t.includes('cpsbvbng26-dotcom/blob/main/DISCLAIMER.md') || !t.includes('cpsbvbng26-dotcom/blob/main/DISCLAIMER.en.md')) bad.push(f + '：免責事項へのリンク');
    if (!t.includes('「issue の中身と言語モデル」') || !t.includes('"Issues and the language model"')) bad.push(f + '：節の名');
    if (!CONSENT_EN.startsWith(RULE17)) bad.push('決めごとの文');
    if (!f.endsWith('error-report.yml') && (!t.includes('印は任意です。') || !t.includes('The box is optional.'))) bad.push(f + '：任意であること');
  }
  const P = F.get('policies/privacy.md') || '', E = F.get('policies/privacy.en.md') || '';
  if (!P.includes('「' + CONSENT_EN + '」')) bad.push('privacy.md が同意の文を引いていない');
  if (!E.includes('"' + CONSENT_EN + '"')) bad.push('privacy.en.md が同意の文を引いていない');
  if (!(F.get('CLAUDE.md') || '').includes('（"' + RULE17 + '"）')) bad.push('CLAUDE.md が決めごと 17 の文を持たない');
  return bad;
});

check('このリポジトリの様式は、書く欄より前に利用目的と規程へのリンクを置き、個人情報を書かない形を示す', (F) => {
  const bad = [];
  for (const f of FORMS) {
    const t = F.get(f) || '';
    const first = t.indexOf('  - type: markdown');
    const field = t.search(/\n  - type: (?!markdown)/);
    const head = first >= 0 && field > first ? t.slice(first, field) : '';
    if (!head) { bad.push(f + '：最初が説明の欄でない'); continue; }
    if (!head.includes(REPO + '/blob/main/policies/privacy.md') || !head.includes(REPO + '/blob/main/policies/privacy.en.md')) bad.push(f + '：個人情報の取り扱いへのリンク');
    if (!/にだけ使います。/.test(head) || !/used only/.test(head)) bad.push(f + '：利用目的');
    if (!head.includes('この issue は公開されます。') || !head.includes('This issue is public.')) bad.push(f + '：公開されること');
  }
  const c = F.get(FORMS[0]) || '';
  if (!c.includes('要配慮個人情報') || !c.includes('special care-required personal information')) bad.push('申し出の様式：要配慮個人情報');
  if (!/blank_issues_enabled: false/.test(F.get('.github/ISSUE_TEMPLATE/config.yml') || '')) bad.push('白紙の issue が開ける');
  return bad;
});

check('様式とワークフローが使うラベルを、labels.yml が作る', (F) => {
  const L = F.get('.github/workflows/labels.yml') || '';
  const made = new Set([...L.matchAll(/gh label create "([^"]+)"/g)].map((m) => m[1]));
  const want = new Set();
  for (const f of ALL_FORMS) for (const m of (F.get(f) || '').matchAll(/^labels: \[([^\]]*)\]/gm)) m[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean).forEach((x) => want.add(x));
  ['法令', 'quote verified', 'not verified', 'not checked', 'needs a person'].forEach((x) => want.add(x));
  if (!(F.get('tools/statutes.js') || '').includes("encodeURIComponent('法令')")) want.add('（見張りのラベルが法令でない）');
  return [...want].filter((x) => !made.has(x));
});

check('どのファイルにも、メールアドレスが無い', (F) => {
  const bad = [];
  for (const [f, t] of F) if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.test(t) || new RegExp('mail' + 'to:', 'i').test(t)) bad.push(f);
  return bad;
});

check('どのファイルにも、大学の名と自称の肩書きが無い', (F) => {
  const bad = [];
  for (const [f, t] of F) {
    if (f === 'verification/check.js') continue;
    if (SCHOOL.some((re) => re.test(t))) bad.push(f + '：大学の名');
    if (TITLES.some((w) => t.includes(w))) bad.push(f + '：肩書き');
  }
  return bad;
});

check('どのファイルにも、運営者のほかの創作の場の名が無い', (F) => {
  const bad = [];
  for (const [f, t] of F) if (OTHER_PLACE.some((w) => t.toLowerCase().includes(w.toLowerCase()))) bad.push(f);
  return bad;
});

check('記した条文は、記した sha256 と合い、法令の番号の形と出どころを持つ', (F) => {
  const S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json');
  if (!S || !T) return ['statutes.json か statutes-texts.json が読めない'];
  const bad = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(S.fetched || '')) bad.push('取り寄せた日');
  for (const e of S.statutes) {
    const k = e.law + ' ' + e.label;
    if (!/^\d{3}[A-Z]{2}\d{10}$|^\d{3}[A-Z]{2}[0-9A-Z]{10}$/.test(e.law_id)) bad.push(k + '：法令の番号');
    if (!e.law_id_from) bad.push(k + '：番号の出どころ');
    if (T[k] === undefined || sha(T[k]) !== e.sha256) bad.push(k + '：sha256');
  }
  if (Object.keys(T).length !== S.statutes.length) bad.push('写した文の数が条の数と違う');
  const ids = new Set(S.statutes.filter((e) => e.law === '個人情報保護法').map((e) => e.law_id));
  if (ids.size !== 1) bad.push('同じ法令に二つの番号');
  for (const p of S.policies) {
    if (!/^[0-9a-f]{40}$/.test(p.commit)) bad.push(p.name + '：コミット');
    for (const [s, ph] of Object.entries(p.sections || {})) if (!p.phrases.includes(ph)) bad.push(p.name + ' ' + s);
  }
  return bad;
});

check('法令の整理の頁（日英）の引用が、取り寄せた条の文にそのまま現れ、記した条をすべて引き、取り寄せた日を書く', (F) => {
  const S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json');
  if (!S || !T) return ['statutes.json が読めない'];
  const bad = [];
  const policy = S.policies[0];
  for (const f of ['policies/law.md', 'policies/law.en.md']) {
    const text = F.get(f) || '';
    const en = isEn(f);
    const R = refs(text, en);
    const used = new Set();
    let carry = null;
    text.split('\n').forEach((line, n) => {
      const rl = R.filter((r) => r.line === n);
      for (const q of quotes(line)) {
        if (q.text === null) { bad.push(f + ' ' + (n + 1) + '：閉じない「'); break; }
        /* リンクの後の「」は、頁の節の名であって、条の引用ではない。 */
        if (line.slice(0, q.at).endsWith(')の')) continue;
        const before = rl.filter((r) => r.at < q.at);
        const r = before.length ? before[before.length - 1] : carry;
        if (!r) { bad.push(f + ' ' + (n + 1) + '：どの条の引用か分からない'); continue; }
        if (r.kind === 'section') { if (policy.sections[r.section] !== q.text) bad.push(f + ' ' + (n + 1) + '：' + r.section + ' の句'); continue; }
        const k = statuteKey(S, r);
        if (!k) { bad.push(f + ' ' + (n + 1) + '：記していない条'); continue; }
        used.add(k);
        if (!T[k] || !T[k].includes(q.text)) bad.push(f + ' ' + (n + 1) + '：' + k + ' に無い句「' + q.text.slice(0, 20) + '」');
      }
      if (rl.length) carry = rl[rl.length - 1];
    });
    for (const e of S.statutes) if (!used.has(e.law + ' ' + e.label)) bad.push(f + '：' + e.law + ' ' + e.label + ' を引いていない');
    const d = en ? 'fetched from the e-Gov law API on ' + S.fetched + '.' : S.fetched + ' に e-Gov 法令 API から取り寄せた';
    if (!text.includes(d)) bad.push(f + '：取り寄せた日');
    if (!text.includes(policy.commit)) bad.push(f + '：規約のコミット');
  }
  const LIC = F.get('LICENSE') || '';
  for (const f of ['policies/licences.md', 'policies/licences.en.md']) {
    const qs = quotes(F.get(f) || '');
    if (qs.length !== 2) bad.push(f + '：LICENSE からの引用の数');
    for (const q of qs) if (!q.text || !LIC.includes(q.text)) bad.push(f + '：LICENSE に無い句');
  }
  return bad;
});

check('頁と様式が挙げる条は、どれも記した条である', (F) => {
  const S = json(F, 'verification/statutes.json');
  if (!S) return ['statutes.json が読めない'];
  const bad = [];
  for (const f of PROSE(F).concat(FORMS)) {
    const t = FORMS.includes(f) ? formText(F.get(f)) : F.get(f);
    const R = refs(t, isEn(f)).concat(FORMS.includes(f) ? refs(t, true) : []);
    for (const r of R) {
      if (r.kind === 'section') { if (!S.policies[0].sections[r.section]) bad.push(f + '：節 ' + r.section); continue; }
      if (!statuteKey(S, r)) bad.push(f + '：' + (r.law || '法令の名が無い') + ' ' + r.article + ' 条');
    }
  }
  return bad;
});

/* 散文の数。台帳のどれかの照らし方に当たらない数があれば落ちる。 */
function numberTokens(F, f) {
  const raw = FORMS.includes(f) ? formText(F.get(f)) : F.get(f);
  const t = bare(raw);
  const en = isEn(f);
  const spans = refs(t, en).concat(FORMS.includes(f) ? refs(t, true) : []).map((r) => [r.at, r.end, r.line]);
  /* 台帳の決めた値と決めごとの番号は、その形のまま現れる所だけを通す。 */
  const N = json(F, 'verification/numbers.json') || { fixed: [], rule: {} };
  const forms = N.fixed.flatMap((x) => [x.re, x.en]).concat(N.rule.re ? [N.rule.re, N.rule.en] : []);
  t.split('\n').forEach((line, n) => {
    for (const re of forms) for (const m of line.matchAll(new RegExp(re, 'g'))) spans.push([m.index, m.index + m[0].length, n]);
  });
  const out = [];
  t.split('\n').forEach((line, n) => {
    for (const m of line.matchAll(/(?<![A-Za-z0-9_-])\d+(?:[.\-]\d+)*(?![A-Za-z0-9_])/g)) {
      if (spans.some(([a, b, l]) => l === n && m.index >= a && m.index < b)) continue;
      out.push({ text: m[0], rest: line.slice(m.index), line: n + 1 });
    }
    for (const m of line.matchAll(/[一二三四五六七八九十百千]+(?:つ|件|項目|通り|本|か所|部分|人|条)/g)) out.push({ text: m[0], rest: m[0], line: n + 1, kanji: true });
  });
  return out;
}
const ORCID_OK = (id) => { const d = id.replace(/-/g, ''); let t = 0; for (const c of d.slice(0, -1)) t = (t + Number(c)) * 2; const r = (12 - (t % 11)) % 11; return (r === 10 ? 'X' : String(r)) === d.slice(-1); };
check('散文の数は、どれも台帳に載り、それぞれの照らし方で合う', (F) => {
  const N = json(F, 'verification/numbers.json'), S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json');
  if (!N || !S || !T) return ['台帳が読めない'];
  const bad = [];
  const seenDates = new Set();
  for (const f of PROSE(F).concat(FORMS)) {
    const en = isEn(f);
    for (const tok of numberTokens(F, f)) {
      if (tok.kanji) { bad.push(f + ' ' + tok.line + '：漢字の数「' + tok.text + '」'); continue; }
      if (/^\d{4}-\d{2}-\d{2}/.test(tok.rest)) { const d = tok.rest.slice(0, 10); if (N.dates[d]) { seenDates.add(d); continue; } bad.push(f + ' ' + tok.line + '：台帳に無い日 ' + d); continue; }
      bad.push(f + ' ' + tok.line + '：台帳に無い数 ' + tok.text);
    }
  }
  for (const d of Object.keys(N.dates)) if (!seenDates.has(d)) bad.push('台帳の日 ' + d + ' がどこにも無い');
  /* それぞれの照らし方 */
  const has = (f, s) => (F.get(f) || '').includes(s);
  for (const x of N.fixed) {
    if (x.check === 'age-min') for (const f of ['policies/terms.md', 'policies/privacy.md', 'policies/law.md', FORMS[0]]) if (!has(f, '16 歳')) bad.push(f + '：16 歳');
    if (x.check === 'age-min') for (const f of ['policies/terms.en.md', 'policies/privacy.en.md', 'policies/law.en.md', FORMS[0]]) if (!has(f, '16 years')) bad.push(f + '：16 years');
    if (x.check === 'age-adult' && !(T['民法 第4条'] || '').includes('十八歳')) bad.push('民法第4条に十八歳が無い');
    if (x.check === 'days' && !(has('policies/requests.md', '7 日') && has('policies/requests.en.md', '7 days'))) bad.push('7 日');
    if (x.check === 'licence' && !(F.get('LICENSE') || '').startsWith('Creative Commons Attribution 4.0 International')) bad.push('LICENSE の版');
    if (x.check === 'orcid' && !ORCID_OK(x.re)) bad.push('ORCID iD の検査の数字');
    if (x.check === 'rule18' && !(F.get('CLAUDE.md') || '').includes('2026-11-18 に利用者が 3 回と決め')) bad.push('3 回が CLAUDE.md の決めごとの記録（2026-11-18 の回数）と違う');
    if (x.check === 'rule18-now' && !(F.get('CLAUDE.md') || '').includes('**合っているかを、最低 10 回確かめる。**')) bad.push('10 回が CLAUDE.md の決めごとと違う');
    if (x.check === 'methods') {
      /* 記録の 2026-11-19 の節が名乗る、確かめたやり方の数。続く箇条の数と同じで、決めごとの回数を下らないこと。 */
      const m = /次の (\d+) のやり方で確かめました。\n\n((?:- [^\n]*\n)+)/.exec(F.get('docs/legal-review-2026-11-18.md') || '');
      const 箇条 = m ? m[2].trim().split('\n').length : -1;
      const 決め = Number((/\*\*合っているかを、最低 (\d+) 回確かめる。\*\*/.exec(F.get('CLAUDE.md') || '') || [])[1]);
      if (!m || Number(m[1]) !== 箇条) bad.push('記録の確かめたやり方の数が、箇条の数と違う');
      if (!(箇条 >= 決め)) bad.push('記録の確かめたやり方が、決めごとの回数に満たない');
    }
  }
  if (!/^\*\*/.test(N.rule.begins) || N.rule.number !== Number(N.rule.re.replace(/\D/g, ''))) bad.push('決めごとの番号と文');
  if (!(F.get('verification/statutes.json') || '').includes('"fetched": "' + Object.keys(N.dates)[0] + '"')) bad.push('取り寄せた日が台帳の日と違う');
  return bad;
});

check('規程の約束の文が、一字一句そのままある', (F) => {
  const P = json(F, 'verification/promises.json');
  if (!P) return ['promises.json が読めない'];
  const bad = [];
  for (const [f, list] of Object.entries(P.files)) for (const s of list) if (!(F.get(f) || '').includes(s)) bad.push(f + '：' + s.slice(0, 24));
  if (Object.keys(P.files).length < PAGES(F).filter((p) => p.startsWith('policies/')).length - 6) bad.push('約束を固めた頁が少ない');
  return bad;
});

check('頁と様式のつながり：リンクの先があり、README がすべての規程を挙げ、求めの種類と主題が様式と同じ', (F) => {
  const bad = [];
  const exists = (p) => F.has(p);
  const all = PROSE(F).concat(['CLAUDE.md']);
  for (const f of all.concat(ALL_FORMS, ['.github/ISSUE_TEMPLATE/config.yml'])) {
    const t = F.get(f) || '';
    for (const m of t.matchAll(/\]\((?!https?:|#)([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (!exists(target)) bad.push(f + ' → ' + m[1]);
    }
    for (const m of t.matchAll(new RegExp(REPO.replace(/[.]/g, '\\.') + '/(blob/main/([^)\\s"]+)|issues/new\\?template=([^)\\s"]+))', 'g'))) {
      const target = m[2] || '.github/ISSUE_TEMPLATE/' + m[3];
      if (!exists(target)) bad.push(f + ' → ' + target);
    }
  }
  for (const p of PAGES(F).filter((x) => x.startsWith('policies/'))) {
    const readme = isEn(p) ? 'README.en.md' : 'README.md';
    if (!(F.get(readme) || '').includes('(./' + p + ')')) bad.push(readme + ' が ' + p + ' を挙げない');
  }
  const opts = (t, id) => { const i = t.indexOf('id: ' + id); const j = t.indexOf('validations:', i); return i < 0 ? [] : [...t.slice(i, j).matchAll(/^\s+- (.+)$/gm)].map((m) => m[1].split(' / ')); };
  const reqOpts = opts(F.get('.github/ISSUE_TEMPLATE/request.yml') || '', 'kind');
  const listOf = (t, h) => { const i = t.indexOf(h); const j = t.indexOf('\n\n', t.indexOf('\n- ', i)); return i < 0 ? [] : [...t.slice(i, j).matchAll(/^- (.+)。?$/gm)].map((m) => m[1].replace(/[。.]$/, '')); };
  const ja = listOf(F.get('policies/requests.md') || '', '## 求めることができるもの');
  const en = listOf(F.get('policies/requests.en.md') || '', '## What can be requested');
  if (reqOpts.length === 0 || JSON.stringify(reqOpts.map((o) => o[0])) !== JSON.stringify(ja)) bad.push('求めの種類（日本語）が様式と違う');
  if (JSON.stringify(reqOpts.map((o) => o[1])) !== JSON.stringify(en)) bad.push('求めの種類（英語）が様式と違う');
  const topics = opts(F.get(FORMS[0]) || '', 'topic');
  const heads = (t) => [...t.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  if (topics.length === 0 || JSON.stringify(topics.map((o) => o[0])) !== JSON.stringify(heads(F.get('TOPICS.md') || ''))) bad.push('主題（日本語）が様式と違う');
  if (JSON.stringify(topics.map((o) => o[1])) !== JSON.stringify(heads(F.get('TOPICS.en.md') || ''))) bad.push('主題（英語）が様式と違う');
  for (const t of ['Ask for a private answer', '非公開の連絡を求める']) for (const f of ['policies/requests.md', 'policies/requests.en.md', 'policies/conduct.md', 'policies/conduct.en.md']) {
    if ((isEn(f) ? /[a-z]/.test(t) : !/[a-z]/.test(t)) && !(F.get(f) || '').includes(isEn(f) ? '"' + t + '"' : '「' + t + '」')) bad.push(f + '：' + t);
  }
  return bad;
});

check('日本語と英語の頁が対で、最終更新の日・節の数・数と条がそろう', (F) => {
  const bad = [];
  const N = json(F, 'verification/numbers.json') || { fixed: [] };
  for (const p of PAGES(F).filter((x) => !isEn(x))) {
    const q = p.replace(/\.md$/, '.en.md');
    if (!F.has(q)) { bad.push(q + ' が無い'); continue; }
    const a = F.get(p), b = F.get(q);
    const da = (/最終更新：(\d{4}-\d{2}-\d{2})。/.exec(a) || [])[1], db = (/Last updated: (\d{4}-\d{2}-\d{2})\./.exec(b) || [])[1];
    if (!/^README/.test(p) && (!da || da !== db)) bad.push(p + '：最終更新の日');
    for (const h of ['## ', '### ']) { const c = (t) => t.split('\n').filter((l) => l.startsWith(h)).length; if (c(a) !== c(b)) bad.push(p + '：' + h.trim() + ' の数'); }
    const facts = (t, en) => {
      const s = new Set();
      for (const r of refs(bare(t), en)) s.add(r.kind === 'article' ? r.law + ' ' + r.article : r.section);
      for (const d of bare(t).match(/\d{4}-\d{2}-\d{2}/g) || []) s.add(d);
      for (const x of N.fixed) if (new RegExp(en ? x.en : x.re).test(bare(t))) s.add(x.check);
      return [...s].sort().join(',');
    };
    if (facts(a, false) !== facts(b, true)) bad.push(p + '：数と条が英語の頁と違う（' + facts(a, false) + ' / ' + facts(b, true) + '）');
  }
  for (const q of PAGES(F).filter(isEn)) if (!F.has(q.replace(/\.en\.md$/, '.md'))) bad.push(q + ' に日本語の頁が無い');
  return bad;
});

check('書き方：ですます、二人称を使わない、太字を使わない、ダッシュは段落に一つまで、長い文を置かない', (F) => {
  const bad = [];
  const ENDS = /(です|ます|ません|でした|ました)$/;
  const jaLines = (f) => {
    if (FORMS.includes(f)) {
      const t = F.get(f), out = [];
      let inValue = false;
      for (const l of t.split('\n')) {
        if (/value: \|/.test(l)) { inValue = true; continue; }
        if (inValue && /^ {8}\S/.test(l)) out.push(l.trim()); else if (inValue && !/^ {8}/.test(l)) inValue = false;
      }
      return out.filter((l) => /[ぁ-ん]/.test(l) && !/[A-Za-z]{4,} [a-z]{3,}/.test(l.replace(/https?:\/\/\S+/g, '')));
    }
    let inCode = false;
    return F.get(f).split('\n').filter((l) => { if (/^```/.test(l)) { inCode = !inCode; return false; } return !inCode && l.trim() && !/^(#|\||>|- |\* |\d+\. )/.test(l); });
  };
  for (const f of PROSE(F).concat(FORMS)) {
    const raw = F.get(f) || '';
    const plain = bare(FORMS.includes(f) ? formText(raw) : raw);
    if (/\*\*/.test(plain)) bad.push(f + '：太字');
    if (/あなた|ください|下さい/.test(plain)) bad.push(f + '：二人称か指図');
    if ((isEn(f) || FORMS.includes(f)) && /\b(?:you|your|yours|yourself)\b/i.test(plain)) bad.push(f + '：you');
    for (const para of raw.split(/\n\s*\n/)) if ((bare(para).match(/[—―–]/g) || []).length > 1) bad.push(f + '：ダッシュが一つの段落に二つ以上');
    if (isEn(f)) {
      for (const l of plain.split('\n')) for (const s of l.split(/(?<=\.)\s+/)) if (s.length > 200 && !/^\|/.test(l)) bad.push(f + '：長い文 ' + s.slice(0, 30));
      continue;
    }
    for (const l of jaLines(f)) {
      const b = bare(l).replace(/https?:\/\/\S+/g, '').trim();
      if (/^(最終更新：|\[English\])/.test(b)) continue;
      if (!b.includes('。')) continue;
      const parts = b.split('。');
      if (parts[parts.length - 1].trim() !== '') bad.push(f + '：。の後に文が残る「' + parts[parts.length - 1].slice(0, 16) + '」');
      for (const s of parts.slice(0, -1)) {
        const x = s.replace(/[（(][^（）()]*[）)]$/, '').replace(/[」』]$/, '').trim();
        if (!ENDS.test(x)) bad.push(f + '：ですます調でない「…' + x.slice(-14) + '」');
        if (x.length > 110) bad.push(f + '：長い文「' + x.slice(0, 16) + '…」（' + x.length + ' 字）');
      }
    }
  }
  return bad;
});

check('ワークフローの外のアクションはコミットの値で固め、権限を書き、Dependabot が同じ形で上げる', (F) => {
  const bad = [];
  const wf = [...F.keys()].filter((f) => /^\.github\/workflows\/.+\.yml$/.test(f));
  if (wf.length === 0) bad.push('ワークフローが無い');
  for (const f of wf) {
    const t = F.get(f);
    for (const m of t.matchAll(/uses:\s*(\S+)(.*)$/gm)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1]) || !/# v\d/.test(m[2])) bad.push(f + '：' + m[1]);
    if (!/^permissions:/m.test(t)) bad.push(f + '：権限');
  }
  const D = F.get('.github/dependabot.yml') || '';
  if (!/package-ecosystem: github-actions/.test(D)) bad.push('Dependabot');
  if (/してください|利用者が/.test(D)) bad.push('Dependabot の注釈が利用者に作業を振る');
  if (F.has('package.json')) bad.push('package.json がある');
  return bad;
});

check('CLAUDE.md が、決めごと 16・17・18 に当たる文を持つ', (F) => {
  const t = F.get('CLAUDE.md') || '';
  const want = ['**Claude は利用者に命令しない。** Claude には、利用者に作業を割り当てる権限が無い。',
    '**issue の中身を言語モデルに渡すのは、本人の同意がある題と本文だけにする。**',
    '`list_issues` で一覧を取らない（本文も返る）。コメントは読まない。メールの中身は扱わない。',
    '**合っているかを、最低 10 回確かめる。** 報告・返答・コミット・PR・マージの前に、',
    '確かめた回数とやり方は、報告に一行で書く。2026-11-18 に利用者が 3 回と決め、2026-11-19 に 10 回へ引き上げた。'];
  return want.filter((s) => !t.includes(s)).map((s) => s.slice(0, 24));
});

/* ------------------------------------------------------------ 壊し方 */

const BREAKS = [];
const brk = (name, desc, mut) => BREAKS.push({ name, desc, mut });
const sub = (f, a, b) => (F) => { const t = F.get(f); if (t === undefined || !t.includes(a)) throw new Error('壊し方が当たらない：' + f + ' ' + String(a).slice(0, 30)); F.set(f, t.replace(a, b)); };
const add = (f, s) => (F) => F.set(f, (F.get(f) || '') + s);

const C = (i) => CHECKS[i].name;
brk(C(0), '写しの正本の文を一字変える', sub('SECURITY.md', '7 日以内', '8 日以内'));
brk(C(0), 'verify.js を一字変える', sub('.github/checked-intake/verify.js', "'use strict';", "'use strict'; "));
brk(C(1), '同意の欄の英語の文を一語変える', sub(FORMS[0], 'I consent to the operator giving the title', 'I agree to the operator giving the title'));
brk(C(1), '申し出の同意の欄を必須にする', sub(FORMS[1], 'United States).\n          required: false', 'United States).\n          required: true'));
brk(C(1), '権利者の知らせから第28条を外す', (F) => F.set(FORMS[2], F.get(FORMS[2]).split('個人情報保護法第28条').join('個人情報保護法')));
brk(C(1), 'privacy.md から同意の文の引用を外す', sub('policies/privacy.md', '「I consent', '「We consent'));
brk(C(2), '申し出の様式から利用目的を外す', sub(FORMS[0], 'にだけ使います。', 'に使います。'));
brk(C(2), '白紙の issue を開けるようにする', sub('.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled: false', 'blank_issues_enabled: true'));
brk(C(3), 'labels.yml から「権利」を外す', sub('.github/workflows/labels.yml', 'gh label create "権利"', 'gh label create "権利の知らせ"'));
brk(C(4), 'README にメールアドレスを書く', add('README.md', '\nexample' + '@' + 'example.org\n'));
brk(C(5), 'README に大学の名を書く', add('README.md', '\n' + dec('WkVO') + dec('5aSn5a2m') + '\n'));
brk(C(5), 'TOPICS に肩書きを書く', add('TOPICS.md', '\n独立研究者\n'));
brk(C(6), '免責事項に別の場の名を書く', add('policies/disclaimer.md', '\n' + OTHER_PLACE[1] + '\n'));
brk(C(6), '英語の頁に別の場の名を小文字で書く', add('policies/disclaimer.en.md', '\n' + OTHER_PLACE[0].toLowerCase() + '\n'));
brk(C(7), '写した条文を一字変える', sub('verification/statutes-texts.json', '年齢十八歳をもって', '年齢二十歳をもって'));
brk(C(7), '法令の番号を壊す', sub('verification/statutes.json', '"law_id": "322AC0000000049"', '"law_id": "322AC000000049"'));
brk(C(8), '引用を一字変える', sub('policies/law.md', '「年齢十八歳をもって、成年とする。」', '「年齢二十歳をもって、成年とする。」'));
brk(C(8), '英語の頁の引用を別の条に付ける', sub('policies/law.en.md', 'Article 59 provides: 「著作者人格権', 'Article 64 provides: 「著作者人格権'));
brk(C(8), '記した条の一つを引かなくする', sub('policies/law.md', '労働基準法第11条は、賃金を「労働の対償として使用者が労働者に支払うすべてのものをいう。」と定めます。\n', ''));
brk(C(8), '規約の句を変える', sub('policies/law.md', '「You must be age 13 or older.」', '「You must be age 16 or older.」'));
brk(C(8), 'LICENSE の句を変える', sub('policies/licences.md', '「Our licenses are irrevocable.」', '「Our licenses are revocable.」'));
brk(C(8), '取り寄せた日を変える', sub('policies/law.en.md', 'on 2026-11-18.', 'on 2026-11-17.'));
brk(C(9), '記していない条を挙げる', add('policies/terms.md', '\n民法第709条に従います。\n'));
brk(C(9), '英語の頁に記していない条を挙げる', add('policies/terms.en.md', '\nArticle 709 of the Civil Code applies.\n'));
brk(C(10), '台帳に無い数を書く', add('policies/terms.md', '\n申し出は 3 件まで受けます。\n'));
brk(C(10), '漢字の数を書く', add('TOPICS.md', '\n主題は五つあります。\n'));
brk(C(10), '台帳に無い日を書く', add('README.en.md', '\nSet up on 2026-11-20.\n'));
brk(C(10), '年齢の線を一つの頁で変える', (F) => F.set('policies/privacy.md', F.get('policies/privacy.md').split('16 歳').join('15 歳')));
brk(C(10), 'ORCID iD の数字を一つ変える', sub('verification/numbers.json', '"re": "0009-0000-1406-0547"', '"re": "0009-0000-1406-0548"'));
brk(C(10), '記録に台帳に無い数を書く', add('docs/legal-review-2026-11-18.md', '\n照らした条は 21 条です。\n'));
brk(C(10), '記録の回数を決めごとと変える', sub('CLAUDE.md', '2026-11-18 に利用者が 3 回と決め', '2026-11-18 に利用者が 2 回と決め'));
brk(C(10), '決めごとの今の回数を変える', sub('CLAUDE.md', '**合っているかを、最低 10 回確かめる。**', '**合っているかを、最低 9 回確かめる。**'));
brk(C(10), '記録の確かめたやり方を一つ外す', sub('docs/legal-review-2026-11-18.md', '- 日本語と英語の頁を並べて読み直しました。\n', ''));
brk(C(10), '記録の確かめたやり方を決めごとの回数より少なくする', (F) => F.set('docs/legal-review-2026-11-18.md', F.get('docs/legal-review-2026-11-18.md').replace('次の 11 のやり方で確かめました。', '次の 3 のやり方で確かめました。').replace(/(次の 3 のやり方で確かめました。\n\n)((?:- [^\n]*\n)+)/, (a, h, l) => h + l.split('\n').slice(0, 3).join('\n') + '\n')));
brk(C(9), '記録に記していない条を挙げる', add('docs/legal-review-2026-11-18.md', '\n- 民法第90条に当たるかどうか。\n'));
brk(C(11), '料金の約束を弱める', sub('policies/terms.md', '運営者は、協力する人から料金を取りません。', '運営者は、協力する人から料金をほとんど取りません。'));
brk(C(11), 'Claude を著者にしない文を外す', sub('policies/authorship.en.md', 'Claude is not an author.', 'Claude may be an author.'));
brk(C(12), '規程の頁へのリンクを壊す', sub('README.md', '(./policies/conduct.md)', '(./policies/code.md)'));
brk(C(12), '様式の名を壊す', sub('policies/names.md', 'template=rights.yml', 'template=right.yml'));
brk(C(12), '求めの種類を一つ様式から外す', sub(FORMS[1], '        - 運営者の住所を知ること / The operator\'s address\n', ''));
brk(C(12), '主題を一つ変える', sub('TOPICS.en.md', '## Review as research software', '## Software review'));
brk(C(13), '英語の頁の最終更新の日をずらす', sub('policies/conduct.en.md', 'Last updated: 2026-11-19.', 'Last updated: 2026-11-18.'));
brk(C(13), '英語の頁から節を一つ消す', sub('policies/names.en.md', '## Other people\'s names', 'Other people\'s names'));
brk(C(13), '英語の頁から条を一つ消す', sub('policies/privacy.en.md', 'under Article 28 of the Act on the Protection of Personal Information', 'under the Act on the Protection of Personal Information'));
brk(C(14), 'である調の文を足す', add('policies/conduct.md', '\n運営者は、すべての知らせを読む。\n'));
brk(C(14), '指図の文を足す', add('policies/requests.md', '\n様式で知らせてください。\n'));
brk(C(14), '英語の頁に you を足す', add('policies/terms.en.md', '\nYou may stop at any time.\n'));
brk(C(14), '太字を足す', sub('policies/terms.md', 'この協力は、雇用ではありません。', '**この協力は、雇用ではありません。**'));
brk(C(14), '一つの段落にダッシュを二つ置く', add('TOPICS.md', '\n主題は ― 黄金比の窓 ― にあります。\n'));
brk(C(15), 'アクションを版の名で呼ぶ', sub('.github/workflows/check.yml', 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1', 'actions/checkout@v7'));
brk(C(15), 'ワークフローから権限を外す', sub('.github/workflows/statutes.yml', '\npermissions:\n  contents: read\n\njobs:', '\njobs:'));
brk(C(15), 'package.json を置く', (F) => F.set('package.json', '{}'));
brk(C(16), 'CLAUDE.md から決めごと 18 を外す', sub('CLAUDE.md', '**合っているかを、最低 10 回確かめる。**', '**合っているかを確かめる。**'));

/* ------------------------------------------------------------ 走らせる */

function run(F) { return CHECKS.map((c) => ({ name: c.name, bad: c.fn(F) })); }

if (require.main === module) {
  const F = load();
  if (process.argv.includes('--break')) {
    let missed = 0, total = 0;
    for (const b of BREAKS) {
      total++;
      const G = new Map(F);
      let caught = false, err = null;
      try { b.mut(G); caught = CHECKS.find((c) => c.name === b.name).fn(G).length > 0; } catch (e) { err = e.message; }
      console.log((caught ? '  落ちた  ' : '  通った  ') + b.desc + (err ? ' —— ' + err : ''));
      if (!caught) missed++;
    }
    const without = CHECKS.filter((c) => !BREAKS.some((b) => b.name === c.name));
    for (const c of without) console.log('  壊し方が無い  ' + c.name);
    console.log('\n' + total + ' 通りの壊し方のうち ' + (total - missed) + ' 通りで落ちた。壊し方の無い検査は ' + without.length + ' 本。');
    process.exit(missed || without.length ? 1 : 0);
  }
  let fail = 0;
  for (const r of run(F)) {
    console.log((r.bad.length ? '  落  ' : '  通  ') + r.name);
    for (const b of r.bad) console.log('        ' + b);
    if (r.bad.length) fail++;
  }
  console.log('\n' + CHECKS.length + ' 本の検査のうち ' + (CHECKS.length - fail) + ' 本が通った。');
  process.exit(fail ? 1 : 0);
}
module.exports = { CHECKS, BREAKS, load, refs, quotes, bare };
