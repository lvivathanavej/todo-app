const store = {
  loadBoard() { try { return JSON.parse(localStorage.getItem('board') || 'null'); } catch { return null; } },
  saveBoard(b) { localStorage.setItem('board', JSON.stringify(b)); },
  loadLegacyNotes() { try { return JSON.parse(localStorage.getItem('notes') || 'null'); } catch { return null; } }
};

const $ = id => document.getElementById(id);
const list = $('list'), fab = $('newBtn'), tabbar = $('tabbar');
const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase && supabaseConfig.url && supabaseConfig.publishableKey
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null;

function uid() { return String(Date.now()) + Math.random().toString(36).slice(2, 6); }

function createInitialBoard() {
  const legacy = store.loadLegacyNotes();
  const firstId = uid();
  return {
    activeId: firstId,
    lists: [{ id: firstId, name: 'To do', items: Array.isArray(legacy) ? legacy : [] }]
  };
}

function normaliseBoard(nextBoard) {
  const fallback = createInitialBoard();
  const normalised = nextBoard && Array.isArray(nextBoard.lists) ? nextBoard : fallback;
  if (!normalised.lists.length) normalised.lists.push(fallback.lists[0]);
  normalised.lists.forEach(l => {
    if (!l.id) l.id = uid();
    if (!l.name || !l.name.trim()) l.name = 'To do';
    l.items = l.items || [];
    l.items.forEach((n, i) => {
      if (!n.id) n.id = uid();
      if (!n.status) n.status = 'awaiting';
      if (!n.priority) n.priority = 'important';
      if (!n.created) n.created = (n.updated || Date.now()) + i;
      if (!n.updated) n.updated = n.created;
    });
  });
  if (!normalised.lists.some(l => l.id === normalised.activeId)) normalised.activeId = normalised.lists[0].id;
  return normalised;
}

let board = normaliseBoard(store.loadBoard());
store.saveBoard(board);

function activeList() { return board.lists.find(l => l.id === board.activeId) || board.lists[0]; }
function save() { store.saveBoard(board); }

const CYCLE = {
  status: ['action', 'awaiting', 'done'],
  priority: ['none', 'important', 'urgent', 'urgent_important']
};
const STATUS_LABEL = { awaiting: 'Awaiting', action: 'Action', done: 'Done' };
const PRIORITY_LABEL = { none: '-', urgent: 'Urgent', important: 'Important', urgent_important: 'Critical' };
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

function renderHeaderTitle() {
  const l = activeList();
  const current = $('listName');
  if (!current) return;
  const title = l.name || 'Untitled';
  if (current.tagName === 'INPUT') {
    const h1 = document.createElement('h1');
    h1.id = 'listName';
    h1.title = 'Rename list';
    h1.textContent = title;
    h1.onclick = startHeaderRename;
    current.replaceWith(h1);
    return;
  }
  current.textContent = title;
  current.title = 'Rename list';
  current.onclick = startHeaderRename;
}

function renderList() {
  const l = activeList();
  const notes = l.items;
  renderHeaderTitle();

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
      if (!seg.classList.contains('expanded')) expandSeg(seg);
      else setField(id, kind, btn.dataset.val);
    });
  });
  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.classList.contains('confirming')) deleteItem(btn.dataset.id);
      else armDelete(btn);
    });
  });

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
  deleteRemoteItem(id);
}

let typingUntil = 0;
function setTitle(id, val) {
  const n = activeList().items.find(x => x.id === id);
  if (!n) return;
  n.title = val;
  n.updated = Date.now();
  typingUntil = Date.now() + 800;
  save();
  queueRemoteItemUpsert(id);
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

document.addEventListener('click', e => {
  if (expandedSeg && !e.target.closest('.seg.expanded')) collapseSegs();
});

let justMovedId = null;
function setField(id, kind, val) {
  const n = activeList().items.find(x => x.id === id);
  if (!n) return;
  collapseSegs();
  if (n[kind] === val) return;
  n[kind] = val;
  n.updated = Date.now();
  save();
  justMovedId = id;
  renderList();
  renderTabs();
  upsertRemoteItem(n, activeList().id);
}

function newNote() {
  const now = Date.now();
  const l = activeList();
  const n = { id: uid(), title: '', updated: now, created: now, status: 'action', priority: 'none' };
  l.items.push(n);
  save();
  renderList();
  renderTabs();
  upsertRemoteItem(n, l.id);
  const inp = list.querySelector(`input.title[data-id="${n.id}"]`);
  if (inp) { inp.focus(); inp.closest('.note-row').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

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
  board.activeId = id;
  save();
  renderList();
  renderTabs();
}

function addList() {
  const l = { id: uid(), name: 'New list', items: [] };
  board.lists.push(l);
  board.activeId = l.id;
  save();
  renderList(); renderTabs();
  upsertRemoteList(l, board.lists.length - 1);
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
  let finished = false;
  const commit = () => {
    finished = true;
    commitListName(l, input.value);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    renderList(); renderTabs();
  };
  input.addEventListener('blur', cancel);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function startHeaderRename() {
  const l = activeList();
  const titleEl = $('listName');
  if (!l || !titleEl || titleEl.tagName === 'INPUT') return;
  const input = document.createElement('input');
  input.id = 'listName';
  input.className = 'header-rename';
  input.type = 'text';
  input.value = l.name || '';
  titleEl.replaceWith(input);
  input.focus(); input.select();
  let finished = false;
  const commit = () => {
    finished = true;
    commitListName(l, input.value);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    renderList(); renderTabs();
  };
  input.addEventListener('blur', cancel);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
}

function commitListName(l, value) {
  l.name = value.trim() || 'To do';
  save();
  renderList(); renderTabs();
  upsertRemoteList(l, board.lists.findIndex(x => x.id === l.id));
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
  const next = board.lists[Math.max(0, idx - 1)];
  board.activeId = next.id;
  save();
  renderList(); renderTabs();
  deleteRemoteList(id);
}

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
  importFile.value = '';
  importFile.click();
}
importFile.addEventListener('change', () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { alert('That file is not a valid backup.'); return; }
    const incoming = data && data.board ? data.board : data;
    if (!incoming || !Array.isArray(incoming.lists)) { alert('That file is not a recognised To do backup.'); return; }
    const listCount = incoming.lists.length;
    const itemCount = incoming.lists.reduce((s, l) => s + ((l.items && l.items.length) || 0), 0);
    if (!confirm(`Import ${listCount} list${listCount !== 1 ? 's' : ''} with ${itemCount} item${itemCount !== 1 ? 's' : ''}?\n\nThis replaces everything currently on this device.`)) return;
    board = normaliseBoard(incoming);
    save();
    renderList(); renderTabs();
    await replaceRemoteBoard(board);
  };
  reader.readAsText(file);
});

function itemRow(n, listId) {
  return {
    id: n.id,
    list_id: listId,
    title: n.title || '',
    status: n.status || 'action',
    priority: n.priority || 'none',
    created: n.created || Date.now(),
    updated: n.updated || Date.now()
  };
}

function listRow(l, position) {
  return {
    id: l.id,
    name: l.name || 'To do',
    position,
    updated_at: new Date().toISOString()
  };
}

function reportRemoteError(label, error) {
  if (error) console.error(`${label}:`, error.message || error);
}

async function loadRemoteBoard() {
  const { data: remoteLists, error: listsError } = await supabaseClient
    .from('todo_lists')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (listsError) throw listsError;

  const { data: remoteItems, error: itemsError } = await supabaseClient
    .from('todo_items')
    .select('*')
    .order('created', { ascending: true });
  if (itemsError) throw itemsError;

  const itemsByList = new Map();
  (remoteItems || []).forEach(item => {
    const items = itemsByList.get(item.list_id) || [];
    items.push({
      id: item.id,
      title: item.title || '',
      status: item.status || 'action',
      priority: item.priority || 'none',
      created: item.created,
      updated: item.updated
    });
    itemsByList.set(item.list_id, items);
  });

  const lists = (remoteLists || []).map(l => ({
    id: l.id,
    name: l.name || 'To do',
    items: itemsByList.get(l.id) || []
  }));
  return { activeId: board.activeId, lists };
}

async function refreshFromRemote() {
  if (!supabaseClient) return;
  try {
    const remoteBoard = await loadRemoteBoard();
    if (!remoteBoard.lists.length) return;
    board = normaliseBoard(remoteBoard);
    save();
    renderList();
    renderTabs();
  } catch (error) {
    reportRemoteError('Could not load Supabase data', error);
  }
}

let reloadTimer = null;
function scheduleRemoteReload() {
  clearTimeout(reloadTimer);
  const delay = Date.now() < typingUntil ? 900 : 150;
  reloadTimer = setTimeout(refreshFromRemote, delay);
}

async function upsertRemoteList(l, position) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_lists').upsert(listRow(l, position));
  reportRemoteError('Could not save list', error);
}

async function deleteRemoteList(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_lists').delete().eq('id', id);
  reportRemoteError('Could not delete list', error);
}

async function upsertRemoteItem(n, listId) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_items').upsert(itemRow(n, listId));
  reportRemoteError('Could not save item', error);
}

async function deleteRemoteItem(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_items').delete().eq('id', id);
  reportRemoteError('Could not delete item', error);
}

const queuedItemUpserts = new Map();
function queueRemoteItemUpsert(id) {
  if (!supabaseClient) return;
  clearTimeout(queuedItemUpserts.get(id));
  queuedItemUpserts.set(id, setTimeout(() => {
    queuedItemUpserts.delete(id);
    for (const l of board.lists) {
      const item = l.items.find(n => n.id === id);
      if (item) {
        upsertRemoteItem(item, l.id);
        return;
      }
    }
  }, 400));
}

async function replaceRemoteBoard(nextBoard) {
  if (!supabaseClient) return;
  try {
    let response = await supabaseClient.from('todo_items').delete().neq('id', '__never__');
    if (response.error) throw response.error;
    response = await supabaseClient.from('todo_lists').delete().neq('id', '__never__');
    if (response.error) throw response.error;

    const listRows = nextBoard.lists.map((l, index) => listRow(l, index));
    response = await supabaseClient.from('todo_lists').insert(listRows);
    if (response.error) throw response.error;

    const itemRows = nextBoard.lists.flatMap(l => l.items.map(n => itemRow(n, l.id)));
    if (itemRows.length) {
      response = await supabaseClient.from('todo_items').insert(itemRows);
      if (response.error) throw response.error;
    }
  } catch (error) {
    reportRemoteError('Could not replace Supabase data', error);
  }
}

async function initialiseRemote() {
  if (!supabaseClient) {
    console.warn('Supabase is not configured. The app is using localStorage only.');
    return;
  }

  try {
    const remoteBoard = await loadRemoteBoard();
    if (remoteBoard.lists.length) {
      board = normaliseBoard(remoteBoard);
      save();
      renderList();
      renderTabs();
    } else {
      await replaceRemoteBoard(board);
    }

    supabaseClient
      .channel('todo-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists' }, scheduleRemoteReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, scheduleRemoteReload)
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR') console.error('Supabase realtime subscription failed.');
      });
  } catch (error) {
    reportRemoteError('Supabase initialisation failed', error);
  }
}

$('exportBtn').addEventListener('click', exportBackup);
$('importBtn').addEventListener('click', importBackup);
fab.addEventListener('click', newNote);

renderList();
renderTabs();
initialiseRemote();
