import { cases } from './data.js';
const $ = id => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
function link(text, href, className = 'source-cite') {
  const node = make('a', className, text);
  // Only inspected GitHub evidence is linked. Synthetic demo URIs stay labels.
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && url.hostname === 'github.com') {
      node.href = url.href; node.target = '_blank'; node.rel = 'noopener noreferrer';
      return node;
    }
  } catch { /* An invalid citation is displayed as text. */ }
  return make('span', className, text);
}
let current = cases[0];
let completed = current.trace.length;
let selected = 1;
let playing = false;
let timer;
let view = 'evidence';
const dataOf = call => JSON.parse(call.result.content.find(c => c.type === 'text').text).data;
const toolOf = call => call.tool ?? call.name;
const duration = ms => ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Number(ms.toFixed(2))} ms`;
function stop() { clearTimeout(timer); playing = false; }
function chooseCase(id) {
  stop(); current = cases.find(c => c.id === id); completed = current.trace.length;
  selected = 1; view = 'evidence'; render();
}
function callLabel(call) {
  const a = call.arguments;
  if (a.path) return a.path.split('/').at(-1) + ' · ' + a.ref.slice(0, 7);
  if (a.number) return 'Issue #' + a.number;
  if (a.base) return a.base + ' → ' + a.head;
  return a.query ? '“' + a.query + '”' : 'Evidence retrieval';
}
function render() {
  const nav = $('case-list'); nav.replaceChildren();
  for (const c of cases) {
    const button = make('button', 'case-option' + (c.id === current.id ? ' selected' : ''));
    button.setAttribute('aria-pressed', String(c.id === current.id));
    button.append(make('span', 'case-dot'));
    const text = make('span'); text.append(make('strong', '', c.nav), make('small', '', c.repo));
    button.append(text); button.onclick = () => { chooseCase(c.id); $('case-list').querySelector('[aria-pressed="true"]').focus(); }; nav.append(button);
  }
  $('case-title').textContent = current.title;
  $('case-subtitle').textContent = current.subtitle;
  $('case-number').textContent = current.issueLabel;
  $('repo-link').textContent = '⌘  ' + current.repo;
  $('repo-link').href = current.repoUrl;
  $('case-kind').textContent = current.kind;
  $('metric-calls').textContent = String(current.trace.length).padStart(2, '0');
  $('metric-time').textContent = duration(current.trace.reduce((sum, c) => sum + c.durationMs, 0));
  $('metric-scope').textContent = current.scope;
  $('metric-note').textContent = current.scopeNote;
  $('trace-count').textContent = `${completed} / ${current.trace.length}`;
  $('replay-status').textContent = playing ? `Replaying call ${completed + 1} of ${current.trace.length}` : completed === current.trace.length ? `${completed} calls complete · select a call to inspect` : `Paused · ${completed} of ${current.trace.length} calls complete`;
  $('play').textContent = playing ? 'Ⅱ Pause replay' : completed === current.trace.length ? '↻ Replay session' : '▷ Play replay';
  $('step').disabled = playing || completed === current.trace.length;
  $('progress').style.width = `${completed / current.trace.length * 100}%`;
  const timeline = $('timeline'); timeline.replaceChildren();
  current.trace.forEach((call, i) => {
    const available = i < completed;
    const button = make('button', 'trace-call' + (i === selected ? ' active' : '') + (i > completed ? ' pending' : ''));
    button.disabled = i > completed || (i === completed && completed < current.trace.length);
    button.setAttribute('aria-pressed', String(i === selected));
    button.setAttribute('aria-label', `Call ${i + 1}: ${toolOf(call)}, ${available ? 'completed' : 'pending'}`);
    const info = make('span', 'call-info'); info.append(make('strong', '', toolOf(call)), make('small', '', callLabel(call)));
    button.append(make('span', 'call-index', available ? '✓' : String(i + 1).padStart(2, '0')), info, make('span', 'call-duration', duration(call.durationMs)));
    button.onclick = () => { selected = i; render(); $('timeline').children[i].focus(); };
    timeline.append(button);
  });
  renderDetail();
  $('findings-title').closest('section').hidden = completed < current.trace.length;
  $('finding').textContent = current.finding;
  $('confidence').textContent = current.confidence;
  $('missing').textContent = current.missing;
  $('finding-links').replaceChildren(...current.links.map(l => link(l.text + ' ↗', l.url, '')));
}
function renderDetail() {
  const call = current.trace[selected];
  $('detail-step').textContent = `TOOL CALL ${String(selected + 1).padStart(2, '0')} / ${String(current.trace.length).padStart(2, '0')}`;
  $('detail-title').textContent = toolOf(call);
  $('detail-duration').textContent = selected < completed ? `✓ ${duration(call.durationMs)}` : 'PENDING';
  for (const name of ['evidence', 'raw']) {
    const tab = $('tab-' + name); tab.setAttribute('aria-selected', String(view === name)); tab.tabIndex = view === name ? 0 : -1;
  }
  const panel = $('detail-content'); panel.replaceChildren(); panel.setAttribute('aria-labelledby', 'tab-' + view);
  if (selected >= completed) {
    const empty = make('div', 'empty-result'); empty.append(make('strong', '', playing ? 'Replaying this call…' : 'Ready when you are'), make('p', '', 'Press Play or Step forward to reveal the saved response. This is a recorded session.')); panel.append(empty); return;
  }
  if (view === 'raw') { panel.append(make('pre', 'raw', JSON.stringify(call.result, null, 2))); return; }
  panel.append(make('span', 'section-label', 'ARGUMENTS'), make('pre', 'arguments', JSON.stringify(call.arguments, null, 2)), make('span', 'section-label', 'RETURNED EVIDENCE'));
  const data = dataOf(call);
  if (toolOf(call) === 'get_issue') {
    panel.append(make('h3', 'result-title', `#${data.number} · ${data.title}`), link(data.url.startsWith('demo:') ? 'Synthetic issue fixture' : 'View issue on GitHub ↗', data.url), make('div', 'prose', data.body));
  } else if (toolOf(call) === 'get_issue_comments') {
    panel.append(make('div', 'file-meta', `${data.comments.length} comments · page ${data.page} · ${data.nextPage ? `next page: ${data.nextPage}` : 'no further pages'}`));
    if (!data.comments.length) panel.append(make('p', 'prose', 'No comments returned on this page.'));
    for (const comment of data.comments) {
      const card = make('article', 'comment');
      const header = make('div', 'comment-header'); header.append(make('span', 'avatar', comment.author.slice(0, 1).toUpperCase()), make('strong', '', comment.author));
      const time = make('time', '', comment.createdAt.slice(0, 10)); time.dateTime = comment.createdAt; header.append(time); card.append(header);
      if (comment.body.length > 550) {
        card.append(make('div', 'prose', comment.body.slice(0, 300) + '…'));
        const details = make('details'); details.append(make('summary', '', 'Read full recorded comment'), make('div', 'prose', comment.body)); card.append(details);
      } else card.append(make('div', 'prose', comment.body));
      card.append(link('Source comment ↗', comment.url));
      if (comment.truncated) card.append(make('div', 'evidence-notice', 'This comment was clipped in the saved response.'));
      panel.append(card);
    }
    if (data.truncated) panel.append(make('div', 'evidence-notice', 'Discussion is partial. Inspect nextPage and comment truncation flags.'));
  } else if (toolOf(call) === 'get_file') {
    panel.append(make('h3', 'result-title', data.path), make('div', 'file-meta', `Commit ${data.commitSha.slice(0, 12)} · lines ${data.startLine}–${data.endLine} of ${data.totalLines}`), link(data.url.startsWith('demo:') ? 'Synthetic source excerpt' : 'Open pinned source ↗', data.url));
    const code = make('div', 'code');
    data.content.split('\n').forEach((line, i) => {
      const row = make('div', 'code-line'); row.append(make('span', 'line-number', data.startLine + i), make('code', '', line)); code.append(row);
    }); panel.append(code);
    if (data.truncated) panel.append(make('div', 'evidence-notice', 'Partial file excerpt. The saved response does not contain the entire file.'));
  } else if (toolOf(call) === 'search_logs') {
    if (!data.available) {
      const empty = make('div', 'empty-result'); empty.append(make('span', '', '◎'), make('strong', '', 'No application logs configured'), make('p', '', 'Missing evidence is part of the finding.\nThe tool did not substitute synthetic logs.')); panel.append(empty);
    } else for (const entry of data.entries) panel.append(make('pre', 'arguments', `${entry.timestamp}  ${entry.level.toUpperCase()}\n${entry.message}`));
  } else if (toolOf(call) === 'search_issues') {
    panel.append(make('p', 'file-meta', `${data.issues.length} of ${data.total} matching issues returned`));
    for (const issue of data.issues) {
      const card = make('div', 'issue-card'); card.append(make('strong', '', `#${issue.number} · ${issue.title}`), make('p', 'prose', issue.body), link('Issue source ↗', issue.url)); panel.append(card);
    }
  } else if (toolOf(call) === 'compare_commits') {
    panel.append(make('h3', 'result-title', `${data.base} → ${data.head}`), link('Release comparison ↗', data.url));
    for (const file of data.files) panel.append(make('h3', 'result-title', file.filename), make('pre', 'arguments', file.patch ?? 'Patch unavailable'));
    if (data.truncated) panel.append(make('div', 'evidence-notice', 'Comparison is incomplete. Check the original source before concluding.'));
  }
}
function schedule() {
  clearTimeout(timer);
  if (!playing) return;
  const delay = Math.min(1600, Math.max(600, current.trace[completed].durationMs)) / Number($('speed').value);
  timer = setTimeout(() => {
    completed++;
    if (completed === current.trace.length) { playing = false; selected = completed - 1; }
    else selected = completed;
    render(); if (playing) schedule();
  }, delay);
}
$('play').onclick = () => {
  if (playing) { stop(); render(); return; }
  if (completed === current.trace.length) completed = 0;
  playing = true; selected = completed; render(); schedule();
};
$('step').onclick = () => { if (completed < current.trace.length) { selected = completed; completed++; render(); } };
$('reset').onclick = () => { stop(); completed = 0; selected = 0; render(); };
$('speed').onchange = () => { if (playing) schedule(); };
for (const name of ['evidence', 'raw']) {
  const tab = $('tab-' + name);
  tab.onclick = () => { view = name; renderDetail(); };
  tab.onkeydown = event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); view = event.key === 'Home' ? 'evidence' : event.key === 'End' ? 'raw' : view === 'raw' ? 'evidence' : 'raw';
      renderDetail(); $('tab-' + view).focus();
    }
  };
}
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ case: current.id, recorded: true, trace: current.trace }, null, 2)], { type: 'application/json' }));
  const a = make('a'); a.href = url; a.download = `${current.id}-trace.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
render();
