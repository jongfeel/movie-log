// node scripts/calendar.mjs add 12 [13 ...]  issue를 movies.json에 추가하고 README 갱신
// node scripts/calendar.mjs build            movies.json으로 README만 다시 생성
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPO = 'jongfeel/movie-log';
const OWNER = 'jongfeel';
const DATA = new URL('../movies.json', import.meta.url);
const README = new URL('../README.md', import.meta.url);
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byDate = (a, b) => a.watched.localeCompare(b.watched) || a.issue - b.issue;

function section(body, name) {
  const parts = body.replace(/\r\n/g, '\n').split(/^### /m);
  const hit = parts.find((p) => p.split('\n')[0].trim() === name);
  return hit ? hit.split('\n').slice(1).join('\n').trim() : '';
}

export function parseIssue({ number, title, body }) {
  const watched = section(body, '관람일');
  const date = new Date(`${watched}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(watched) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== watched) {
    throw new Error(`#${number}: 관람일이 올바르지 않습니다: "${watched}"`);
  }
  const text = section(body, '포스터');
  // Markdown 이미지, <img>, 한 줄 URL 중 먼저 나온 것을 사용한다.
  const m = text.match(/!\[[^\]]*\]\(\s*(https:\/\/[^\s)]+)|<img\b[^>]*?\bsrc=["'](https:\/\/[^"']+)|^(https:\/\/\S+)$/im);
  const poster = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!poster) throw new Error(`#${number}: 포스터 칸에서 이미지를 찾지 못했습니다.`);
  return { issue: number, title: title.trim(), watched, poster };
}

function renderMonth(y, m, movies) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((first + last) / 7) * 7;
  const out = [
    `### ${m}월 (${movies.length}편)`,
    '',
    '<table>',
    `<tr>${DAYS.map((d) => `<th width="110">${d}</th>`).join('')}</tr>`,
  ];
  for (let i = 0; i < total; i += 7) {
    out.push('<tr>');
    for (let j = i; j < i + 7; j++) {
      const day = j - first + 1;
      const valid = day >= 1 && day <= last;
      const posters = movies
        .filter((v) => valid && +v.watched.slice(8) === day)
        .map((v) => `<br><a href="https://github.com/${REPO}/issues/${v.issue}"><img src="${esc(v.poster)}" width="90" alt="${esc(v.title)}"></a>`);
      out.push(`<td align="center" valign="top">${valid ? day : ''}${posters.join('')}</td>`);
    }
    out.push('</tr>');
  }
  return [...out, '</table>', ''].join('\n');
}

export function render(movies) {
  if (!movies.length) return '아직 기록이 없습니다.\n';
  const sorted = [...movies].sort(byDate);
  const years = [...new Set(sorted.map((v) => v.watched.slice(0, 4)))].reverse();
  return years.map((y, i) => {
    const list = sorted.filter((v) => v.watched.startsWith(y));
    const months = [...new Set(list.map((v) => +v.watched.slice(5, 7)))].reverse();
    const content = months
      .map((m) => renderMonth(+y, m, list.filter((v) => v.watched.slice(5, 7) === pad(m))))
      .join('\n');
    return i === 0
      ? `## ${y} (${list.length}편)\n\n${content}`
      : `<details>\n<summary><b>${y} (${list.length}편)</b></summary>\n\n${content}\n</details>\n`;
  }).join('\n');
}

function main([cmd, ...args]) {
  let movies = JSON.parse(readFileSync(DATA, 'utf8'));
  if (cmd === 'add' && args.length && args.every((a) => /^[1-9]\d*$/.test(a))) {
    for (const n of args) {
      const issue = JSON.parse(execFileSync(
        'gh',
        ['issue', 'view', n, '--repo', REPO, '--json', 'number,title,body,author'],
        { encoding: 'utf8' },
      ));
      if (issue.author.login !== OWNER) throw new Error(`#${n}: ${OWNER}이 작성한 issue가 아닙니다.`);
      const movie = parseIssue(issue);
      movies = [...movies.filter((v) => v.issue !== movie.issue), movie];
    }
    movies.sort(byDate);
  } else if (cmd !== 'build') {
    throw new Error('사용법: node scripts/calendar.mjs add <issue...> | build');
  }
  const readme = readFileSync(README, 'utf8').replace(/\r\n/g, '\n');
  const re = /(<!-- calendar:start -->\n)[\s\S]*(<!-- calendar:end -->)/;
  if (!re.test(readme)) throw new Error('README.md에 calendar 표시가 없습니다.');
  const next = readme.replace(re, (_, start, end) => `${start}\n${render(movies)}\n${end}`);
  if (cmd === 'add') writeFileSync(DATA, JSON.stringify(movies, null, 2) + '\n');
  writeFileSync(README, next);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
