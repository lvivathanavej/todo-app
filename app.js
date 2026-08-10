const store = {
  loadBoard() { try { return JSON.parse(localStorage.getItem('board') || 'null'); } catch { return null; } },
  saveBoard(b) { localStorage.setItem('board', JSON.stringify(b)); },
  loadLegacyNotes() { try { return JSON.parse(localStorage.getItem('notes') || 'null'); } catch { return null; } }
};

const $ = id => document.getElementById(id);
const list = $('list'), fab = $('newBtn'), tabbar = $('tabbar');

function uid() { return String(Date.now()) + Math.random().toString(36).slice(2, 6); }

// ---- Load or initialise the board ----
let board = store.loadBoard();
if (!board) {
  // Migrate any pre-existing single list of notes into the first tab
  const legacy = store.loadLegacyNotes();
  const firstId = uid();
  board = {
    activeId: firstId,
    lists: [{ id: firstId, name: 'To do', items: Array.isArray(legacy) ? legacy : [] }]
  };
  store.saveBoard(board);
}

// Normalise every item across every list
board.lists.forEach(l => {
  if (!l.name || !l.name.trim()) l.name = 'To do';
  l.items = l.items || [];
  l.items.forEach((n, i) => {
    if (!n.status) n.status = 'awaiting';
    if (!n.priority) n.priority = 'important';
    if (!n.created) n.created = (n.updated || Date.now()) + i;
  });
});
store.saveBoard(board);
if (!board.lists.some(l => l.id === board.activeId)) board.activeId = board.lists[0].id;

function activeList() { return board.lists.find(l => l.id === board.activeId) || board.lists[0]; }
function save() { store.saveBoard(board); }

const CYCLE = {
  status: ['action', 'awaiting', 'done'],
  priority: ['none', 'important', 'urgent', 'urgent_important']
};
const STATUS_LABEL = { awaiting: 'Awaiting', action: 'Action', done: 'Done' };
const PRIORITY_LABEL = { none: '-', urgent: 'Urgent', important: 'Important', urgent_important: 'Critical' };
// Inline SVG icons (white stroke/fill, sized to the circle). 'none' renders as an empty circle.
const ICONS = {
  none: '',
  urgent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"></circle><path d="M12 10v3l2 1.5"></path><path d="M9 2h6"></path></svg>',
  important: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"></path></svg>',
  urgent_important: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v8"></path><path d="M12 18h.01"></path></svg>',
  action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v8"></path><path d="M12 18h.01"></path></svg>',
  awaiting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4"></path><path d="M12 18h.01"></path></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>'
};
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function segButtons(kind, current, labels) {
  return CYCLE[kind].map(val =>
    `<button data-val="${val}" class="${current === val ? 'on' : ''}" title="${esc(labels[val])}" aria-label="${esc(labels[val])}">${ICONS[val] || ''}</button>`
  ).join('');
}
function cardToggles(n) {
  return `<div class="toggles card-toggles">
    <div class="seg priority" data-kind="priority">${segButtons('priority', n.priority, PRIORITY_LABEL)}</div>
    <div class="seg status" data-kind="status">${segButtons('status', n.status, STATUS_LABEL)}</div>
  </div>`;
}

// ================= Item list =================
function renderList() {
  const l = activeList();
  const notes = l.items;
  $('listName').textContent = l.name || 'Untitled';

  const PRIORITY_RANK = { urgent_important: 0, urgent: 1, important: 2, none: 3 };
  const STATUS_RANK = { done: 0, action: 1, awaiting: 2 };
  const sorted = [...notes].sort((a, b) => {
    const aDone = a.status === 'done' ? 0 : 1;
    const bDone = b.status === 'done' ? 0 : 1;
    if (aDone !== bDone) return aDone - bDone;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s !== 0) return s;
    return a.created - b.created;
  });
  $('count').textContent = notes.length ? `${notes.length} item${notes.length > 1 ? 's' : ''}` : '';

  if (!sorted.length) {
    list.innerHTML = `<div class="empty">
      <div class="big">No items yet</div>
      <div>Tap + to add your first to do.</div>
    </div>`;
    return;
  }
  list.innerHTML = sorted.map(n => `
    <div class="note-row">
      <div class="note-card${n.status === 'done' ? ' done' : ''}" data-id="${n.id}">
        <div class="card-text">
          <input class="title" type="text" value="${esc(n.title || '')}" placeholder="New item" data-id="${n.id}">
        </div>
        ${cardToggles(n)}
      </div>
      <button class="del-btn" data-id="${n.id}" aria-label="Delete item" title="Delete">${TRASH_SVG}</button>
    </div>`).join('');

  list.querySelectorAll('input.title').forEach(inp => {
    inp.addEventListener('input', () => setTitle(inp.dataset.id, inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); newNote(); }
    });
  });
  list.querySelectorAll('.seg button').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const seg = btn.closest('.seg');
      const id = btn.closest('.note-card').dataset.id;
      const kind = seg.dataset.kind;
      if (!seg.classList.contains('expanded')) {
        // First tap on the collapsed icon: open the option row
        expandSeg(seg);
      } else {
        // Tap on an option: apply it, collapse, re-sort, highlight
        setField(id, kind, btn.dataset.val);
      }
    });
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.classList.contains('confirming')) deleteItem(btn.dataset.id);
      else armDelete(btn);
    });
  });

  // Highlight the item that just moved, so the eye can follow it
  if (justMovedId) {
    const moved = list.querySelector(`.note-card[data-id="${justMovedId}"]`);
    if (moved) {
      moved.classList.add('just-moved');
      moved.closest('.note-row').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      moved.addEventListener('animationend', () => moved.classList.remove('just-moved'), { once: true });
    }
    justMovedId = null;
  }
}

// ---- Two-step delete for items ----
let armedBtn = null, armTimer = null;
function armDelete(btn) {
  disarmDelete();
  btn.classList.add('confirming');
  btn.textContent = 'Delete?';
  armedBtn = btn;
  armTimer = setTimeout(disarmDelete, 3000);
}
function disarmDelete() {
  clearTimeout(armTimer);
  if (armedBtn && armedBtn.isConnected) {
    armedBtn.classList.remove('confirming');
    armedBtn.innerHTML = TRASH_SVG;
  }
  armedBtn = null;
}
document.addEventListener('click', e => {
  if (armedBtn && !e.target.closest('.del-btn')) disarmDelete();
});

function deleteItem(id) {
  disarmDelete();
  const l = activeList();
  l.items = l.items.filter(x => x.id !== id);
  save();
  renderList();
  renderTabs();
}
function setTitle(id, val) {
  const n = activeList().items.find(x => x.id === id);
  if (!n) return;
  n.title = val; n.updated = Date.now(); save();
}
let expandedSeg = null;
function expandSeg(seg) {
  collapseSegs();
  seg.classList.add('expanded');
  expandedSeg = seg;
}
function collapseSegs() {
  if (expandedSeg && expandedSeg.isConnected) expandedSeg.classList.remove('expanded');
  expandedSeg = null;
}
// Tapping anywhere else closes an open option row
document.addEventListener('click', e => {
  if (expandedSeg && !e.target.closest('.seg.expanded')) collapseSegs();
});

let justMovedId = null;
function setField(id, kind, val) {
  const n = activeList().items.find(x => x.id === id);
  if (!n) return;
  collapseSegs();
  if (n[kind] === val) return; // no change; just close
  n[kind] = val;
  n.updated = Date.now();
  save();
  justMovedId = id;           // remember which row to highlight after re-sort
  renderList();
  renderTabs();
}
function newNote() {
  const now = Date.now();
  const n = { id: uid(), title: '', updated: now, created: now, status: 'action', priority: 'none' };
  activeList().items.push(n);
  save();
  renderList();
  renderTabs();
  const inp = list.querySelector(`input.title[data-id="${n.id}"]`);
  if (inp) { inp.focus(); inp.closest('.note-row').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

// ================= Tabs =================
function renderTabs() {
  tabbar.innerHTML = board.lists.map(l => {
    const active = l.id === board.activeId;
    const items = l.items || [];
    const total = items.length;
    const done = items.filter(i => i.status === 'done').length;
    const action = items.filter(i => i.status === 'action').length;
    const awaiting = items.filter(i => i.status === 'awaiting').length;
    const pct = total ? (n => (n / total * 100).toFixed(2)) : () => 0;
    const bar = total
      ? `<span class="tab-bar">
           <span class="seg-done" style="width:${pct(done)}%"></span>
           <span class="seg-action" style="width:${pct(action)}%"></span>
           <span class="seg-awaiting" style="width:${pct(awaiting)}%"></span>
         </span>`
      : '';
    return `<button class="tab${active ? ' active' : ''}${total ? '' : ' no-items'}" data-id="${l.id}">
      <span class="tab-top">
        <span class="tab-name">${esc(l.name || 'To do')}</span>
        ${total ? `<span class="tab-count">${done}/${total}</span>` : ''}
        ${active ? `<span class="tab-del" data-id="${l.id}" title="Delete list" aria-label="Delete list">${TRASH_SVG}</span>` : ''}
      </span>
      ${bar}
    </button>`;
  }).join('') + `<button class="tab-add" id="tabAdd" aria-label="New list" title="New list">+</button>`;

  tabbar.querySelectorAll('.tab').forEach(tab => {
    const id = tab.dataset.id;
    // Single tap: switch. Tap on already-active tab name: rename.
    tab.querySelector('.tab-name').addEventListener('click', e => {
      e.stopPropagation();
      if (id === board.activeId) startRename(tab, id);
      else switchTo(id);
    });
    tab.addEventListener('click', () => { if (id !== board.activeId) switchTo(id); });
    const del = tab.querySelector('.tab-del');
    if (del) del.addEventListener('click', e => { e.stopPropagation(); confirmDeleteList(id); });
  });
  $('tabAdd').addEventListener('click', addList);

  // Bring the active tab into view by scrolling ONLY the tab bar horizontally.
  // (scrollIntoView would scroll ancestor containers too, causing layout jumps on mobile.)
  const activeTab = tabbar.querySelector('.tab.active');
  if (activeTab) {
    const barRect = tabbar.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    if (tabRect.left < barRect.left) {
      tabbar.scrollLeft += tabRect.left - barRect.left - 12;
    } else if (tabRect.right > barRect.right) {
      tabbar.scrollLeft += tabRect.right - barRect.right + 12;
    }
  }
}

function switchTo(id) {
  board.activeId = id; save();
  renderList(); renderTabs();
}

function addList() {
  const l = { id: uid(), name: 'New list', items: [] };
  board.lists.push(l);
  board.activeId = l.id;
  save();
  renderList(); renderTabs();
}

function startRename(tab, id) {
  const l = board.lists.find(x => x.id === id);
  if (!l) return;
  const nameEl = tab.querySelector('.tab-name');
  const input = document.createElement('input');
  input.className = 'tab-rename';
  input.type = 'text';
  input.value = l.name || '';
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const commit = () => {
    const v = input.value.trim();
    l.name = v || 'To do';
    save();
    renderList(); renderTabs();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = l.name || ''; input.blur(); }
  });
}

function confirmDeleteList(id) {
  const l = board.lists.find(x => x.id === id);
  if (!l) return;
  if (board.lists.length === 1) {
    alert('This is your only list - create another before deleting this one.');
    return;
  }
  const count = l.items.length;
  const msg = count
    ? `Delete the list "${l.name}" and its ${count} item${count > 1 ? 's' : ''}? This can't be undone.`
    : `Delete the empty list "${l.name}"?`;
  if (!confirm(msg)) return;
  const idx = board.lists.findIndex(x => x.id === id);
  board.lists = board.lists.filter(x => x.id !== id);
  // pick a neighbouring tab to activate
  const next = board.lists[Math.max(0, idx - 1)];
  board.activeId = next.id;
  save();
  renderList(); renderTabs();
}

// ================= Backup: export / import =================
const menu = $('menu'), menuBtn = $('menuBtn'), importFile = $('importFile');

menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('click', e => {
  if (!menu.hidden && !e.target.closest('.header-right')) menu.hidden = true;
});

function pad(n) { return String(n).padStart(2, '0'); }
function exportBackup() {
  menu.hidden = true;
  const payload = { app: 'todo', version: 1, exportedAt: new Date().toISOString(), board };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const name = `todo-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackup() {
  menu.hidden = true;
  importFile.value = ''; // allow re-importing the same file name
  importFile.click();
}
importFile.addEventListener('change', () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { alert('That file isn\u2019t a valid backup.'); return; }
    const incoming = data && data.board ? data.board : data; // accept raw board too
    if (!incoming || !Array.isArray(incoming.lists)) { alert('That file isn\u2019t a recognised To do backup.'); return; }
    const listCount = incoming.lists.length;
    const itemCount = incoming.lists.reduce((s, l) => s + ((l.items && l.items.length) || 0), 0);
    if (!confirm(`Import ${listCount} list${listCount !== 1 ? 's' : ''} with ${itemCount} item${itemCount !== 1 ? 's' : ''}?\n\nThis replaces everything currently on this device.`)) return;
    board = incoming;
    // normalise imported data
    board.lists.forEach(l => {
      l.items = l.items || [];
      l.items.forEach((n, i) => {
        if (!n.id) n.id = uid();
        if (!n.status) n.status = 'action';
        if (!n.priority) n.priority = 'none';
        if (!n.created) n.created = (n.updated || Date.now()) + i;
      });
    });
    if (!board.lists.length) { const fid = uid(); board.lists = [{ id: fid, name: 'To do', items: [] }]; board.activeId = fid; }
    if (!board.lists.some(l => l.id === board.activeId)) board.activeId = board.lists[0].id;
    save();
    renderList(); renderTabs();
  };
  reader.readAsText(file);
});

$('exportBtn').addEventListener('click', exportBackup);
$('importBtn').addEventListener('click', importBackup);

fab.addEventListener('click', newNote);
renderList();
renderTabs();
