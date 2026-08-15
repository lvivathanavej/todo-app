const store = {
  loadWorkspace() { try { return JSON.parse(localStorage.getItem('todo-workspace-v2') || 'null'); } catch { return null; } },
  saveWorkspace(workspace) { localStorage.setItem('todo-workspace-v2', JSON.stringify(workspace)); },
  loadSelection() { try { return JSON.parse(localStorage.getItem('todo-selection-v1') || '{}'); } catch { return {}; } },
  saveSelection(selection) { localStorage.setItem('todo-selection-v1', JSON.stringify(selection)); },
  loadLegacyBoard() { try { return JSON.parse(localStorage.getItem('board') || 'null'); } catch { return null; } }
};

const $ = id => document.getElementById(id);
const list = $('list');
const userbar = $('userbar');
const tabbar = $('tabbar');
const fab = $('newBtn');
const itemMenu = $('itemMenu');
const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase && supabaseConfig.url && supabaseConfig.publishableKey
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null;

const STATUS_LABEL = { awaiting: 'Awaiting', action: 'Action', done: 'Done' };
const PRIORITY_LABEL = { none: 'No priority', urgent: 'Urgent', important: 'Important', urgent_important: 'Critical' };
const CYCLE = { status: ['action', 'awaiting', 'done'], priority: ['none', 'important', 'urgent', 'urgent_important'] };
const USER_TAB_COLORS = ['#bd5b67', '#3b8f87', '#6576c5', '#bd8740', '#9b639b', '#4f83b7'];
const ICONS = {
  none: '',
  urgent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"></circle><path d="M12 10v3l2 1.5"></path><path d="M9 2h6"></path></svg>',
  important: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"></path></svg>',
  urgent_important: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v8"></path><path d="M12 18h.01"></path></svg>',
  action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v8"></path><path d="M12 18h.01"></path></svg>',
  awaiting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4"></path><path d="M12 18h.01"></path></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"></path></svg>'
};
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

function uid() { return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`; }
function esc(value) { const el = document.createElement('div'); el.textContent = value || ''; return el.innerHTML; }
function reportRemoteError(label, error) { if (error) console.error(`${label}:`, error.message || error); }

function fromLegacyBoard(board) {
  if (!board || !Array.isArray(board.lists)) return { users: [], lists: [], items: [] };
  const user = { id: 1, name: 'USER1', deletionAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const legacyLists = board.lists.map((entry, position) => ({ entry, id: entry.id || uid(), position }));
  return {
    users: [user],
    lists: legacyLists.map(({ entry, id, position }) => ({
      id, userId: 1, name: entry.name || 'To do', position,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    })),
    items: legacyLists.flatMap(({ entry, id: listId }) => (entry.items || []).map(item => ({
      id: item.id || uid(), listId, userId: 1, title: item.title || '', status: item.status || 'action',
      priority: item.priority || 'none', created: item.created || Date.now(), updated: item.updated || Date.now()
    })))
  };
}

const cachedWorkspace = store.loadWorkspace() || fromLegacyBoard(store.loadLegacyBoard());
const state = {
  users: cachedWorkspace.users || [],
  lists: cachedWorkspace.lists || [],
  items: cachedWorkspace.items || [],
  hydrated: !supabaseClient,
  loadError: false,
  selection: store.loadSelection(),
  editor: null,
  pendingRefresh: false,
  reloadTimer: null,
  requestVersion: 0,
  longPress: null,
  contextItemId: null
};

function saveCache() {
  store.saveWorkspace({ users: state.users, lists: state.lists, items: state.items });
  store.saveSelection(state.selection);
}

function activeUser() {
  const selected = Number(state.selection.activeUserId);
  return state.users.find(user => user.id === selected) || state.users[0] || null;
}

function updateActiveUserTint() {
  const user = activeUser();
  const index = user ? state.users.indexOf(user) : 0;
  document.documentElement.style.setProperty('--active-user-color', user ? USER_TAB_COLORS[index % USER_TAB_COLORS.length] : '#ffffff');
}

function visibleLists() {
  const user = activeUser();
  if (!user) return [];
  return state.lists
    .filter(entry => entry.userId === user.id)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

function activeList() {
  const user = activeUser();
  const lists = visibleLists();
  if (!user || !lists.length) return null;
  const savedId = state.selection.activeListIdByUser && state.selection.activeListIdByUser[user.id];
  return lists.find(entry => entry.id === savedId) || lists[0];
}

function setSelection(userId, listId) {
  state.selection.activeUserId = userId;
  state.selection.activeListIdByUser ||= {};
  if (listId) state.selection.activeListIdByUser[userId] = listId;
  saveCache();
}

function itemSort(a, b) {
  const priority = { urgent_important: 0, urgent: 1, important: 2, none: 3 };
  const status = { done: 0, action: 1, awaiting: 2 };
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? -1 : 1;
  return priority[a.priority] - priority[b.priority] || status[a.status] - status[b.status] || a.created - b.created;
}

function visibleItems() {
  const currentList = activeList();
  if (!currentList) return [];
  const items = state.items
    .filter(item => item.listId === currentList.id)
    .sort(itemSort);
  const draft = items.find(item => item.draftAfterId);
  if (!draft) return items;
  const draftIndex = items.indexOf(draft);
  items.splice(draftIndex, 1);
  const anchorIndex = items.findIndex(item => item.id === draft.draftAfterId);
  if (anchorIndex === -1) {
    items.splice(draftIndex, 0, draft);
    return items;
  }
  items.splice(anchorIndex + 1, 0, draft);
  return items;
}

function queueRender() {
  if (state.editor) return;
  render();
}

function setListTitle(value, editable = false) {
  let title = $('listName');
  if (title.tagName !== 'H1') {
    const heading = document.createElement('h1');
    heading.id = 'listName';
    title.replaceWith(heading);
    title = heading;
  }
  title.textContent = value;
  title.title = editable ? 'Rename list' : '';
  title.onclick = editable ? () => startListRename(activeList()) : null;
}

function renderLoading() {
  setListTitle('To do');
  $('count').textContent = '';
  userbar.innerHTML = '';
  tabbar.innerHTML = '';
  fab.hidden = true;
  list.innerHTML = '<section class="state-card loading" aria-live="polite"><span class="spinner" aria-hidden="true"></span><div><strong>Loading to dos</strong><p>Getting the latest shared workspace...</p></div></section>';
}

function renderEmpty(kind) {
  const copy = {
    users: ['No users yet', 'Create a user to start organizing to dos.', 'Add user'],
    lists: ['No lists yet', 'Create a list for this user to add to dos.', 'Add list'],
    items: ['No items yet', 'Create a to do to get started.', 'Add item']
  }[kind];
  fab.hidden = kind !== 'items';
  list.innerHTML = `<section class="state-card"><div class="state-icon">+</div><strong>${copy[0]}</strong><p>${copy[1]}</p><button class="state-action" data-action="${kind === 'users' ? 'add-user' : kind === 'lists' ? 'add-list' : 'add-item'}">${copy[2]}</button></section>`;
  list.querySelector('.state-action').addEventListener('click', event => {
    const action = event.currentTarget.dataset.action;
    if (action === 'add-user') addUser();
    if (action === 'add-list') addList();
    if (action === 'add-item') newNote();
  });
}

function renderUserbar() {
  userbar.innerHTML = state.users.map((user, index) => {
    const active = activeUser() && user.id === activeUser().id;
    const color = USER_TAB_COLORS[index % USER_TAB_COLORS.length];
    return `<button class="user-tab${active ? ' active' : ''}" data-id="${user.id}" style="--user-color:${color}"><span class="user-name">${esc(user.name)}</span>${active ? `<span class="user-del" title="Delete user" aria-label="Delete user">${TRASH_SVG}</span>` : ''}</button>`;
  }).join('') + '<button class="user-add" id="userAdd" title="Add user" aria-label="Add user">+</button>';

  userbar.querySelectorAll('.user-tab').forEach(tab => {
    const id = Number(tab.dataset.id);
    tab.addEventListener('click', event => {
      if (event.target.closest('.user-del')) return;
      commitActiveEditor();
      if (activeUser() && activeUser().id === id) startUserRename(id);
      else switchUser(id);
    });
    const del = tab.querySelector('.user-del');
    if (del) del.addEventListener('click', event => { event.stopPropagation(); deleteUser(id); });
  });
  $('userAdd').addEventListener('click', addUser);
}

function renderTabs() {
  const current = activeList();
  tabbar.innerHTML = visibleLists().map(entry => {
    const items = state.items.filter(item => item.listId === entry.id);
    const total = items.length;
    const done = items.filter(item => item.status === 'done').length;
    const action = items.filter(item => item.status === 'action').length;
    const awaiting = items.filter(item => item.status === 'awaiting').length;
    const active = current && entry.id === current.id;
    const pct = count => (count / total * 100).toFixed(2);
    const bar = total ? `<span class="tab-bar"><span class="seg-done" style="width:${pct(done)}%"></span><span class="seg-action" style="width:${pct(action)}%"></span><span class="seg-awaiting" style="width:${pct(awaiting)}%"></span></span>` : '';
    return `<button class="tab${active ? ' active' : ''}${total ? '' : ' no-items'}" data-id="${esc(entry.id)}"><span class="tab-top"><span class="tab-name">${esc(entry.name)}</span>${total ? `<span class="tab-count">${done}/${total}</span>` : ''}${active ? `<span class="tab-del" data-id="${esc(entry.id)}" title="Delete list" aria-label="Delete list">${TRASH_SVG}</span>` : ''}</span>${bar}</button>`;
  }).join('') + '<button class="tab-add" id="tabAdd" aria-label="New list" title="New list">+</button>';
  tabbar.querySelectorAll('.tab').forEach(tab => {
    const id = tab.dataset.id;
    const entry = state.lists.find(listEntry => listEntry.id === id);
    tab.querySelector('.tab-name').addEventListener('click', event => {
      event.stopPropagation();
      if (current && id === current.id) startListRename(entry);
      else switchList(id);
    });
    tab.addEventListener('click', () => { if (!current || id !== current.id) switchList(id); });
    const del = tab.querySelector('.tab-del');
    if (del) del.addEventListener('click', event => { event.stopPropagation(); confirmDeleteList(id); });
  });
  $('tabAdd').addEventListener('click', addList);

  const activeTab = tabbar.querySelector('.tab.active');
  if (activeTab) {
    const barRect = tabbar.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    if (tabRect.left < barRect.left) tabbar.scrollLeft += tabRect.left - barRect.left - 12;
    else if (tabRect.right > barRect.right) tabbar.scrollLeft += tabRect.right - barRect.right + 12;
  }
}

function segButtons(kind, current, labels) {
  return CYCLE[kind].map(value => `<button data-val="${value}" class="${current === value ? 'on' : ''}" title="${esc(labels[value])}" aria-label="${esc(labels[value])}">${ICONS[value] || ''}</button>`).join('');
}

function cardToggles(item) {
  return `<div class="toggles card-toggles"><div class="seg priority" data-kind="priority">${segButtons('priority', item.priority, PRIORITY_LABEL)}</div><div class="seg status" data-kind="status">${segButtons('status', item.status, STATUS_LABEL)}</div></div>`;
}

function renderListItems() {
  const currentList = activeList();
  const notes = visibleItems();
  const ownItemCount = state.items.filter(item => item.listId === currentList.id).length;
  $('count').textContent = ownItemCount ? `${ownItemCount} item${ownItemCount === 1 ? '' : 's'}` : '';
  setListTitle(currentList.name, true);

  if (!notes.length) return renderEmpty('items');
  fab.hidden = false;
  list.innerHTML = notes.map(item => `<div class="note-row">
    <div class="note-card${item.status === 'done' ? ' done' : ''}" data-id="${esc(item.id)}" tabindex="0">
      <div class="card-text"><input class="title" type="text" value="${esc(item.title)}" placeholder="New item" data-id="${esc(item.id)}"></div>
      ${cardToggles(item)}
    </div>
  </div>`).join('');

  list.querySelectorAll('input.title').forEach(input => bindTitleEditor(input));
  list.querySelectorAll('.note-card').forEach(card => bindItemMenu(card));
  list.querySelectorAll('.seg button').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    commitActiveEditor();
    const seg = button.closest('.seg');
    if (!seg.classList.contains('expanded')) {
      list.querySelectorAll('.seg.expanded').forEach(entry => entry.classList.remove('expanded'));
      seg.classList.add('expanded');
      return;
    }
    setItemField(button.closest('.note-card').dataset.id, seg.dataset.kind, button.dataset.val);
  }));
}

function render() {
  if (!state.hydrated) return renderLoading();
  updateActiveUserTint();
  renderUserbar();
  const user = activeUser();
  if (!user) {
    setListTitle('To do');
    $('count').textContent = '';
    tabbar.innerHTML = '';
    return renderEmpty('users');
  }
  setSelection(user.id, activeList() && activeList().id);
  renderTabs();
  if (!activeList()) {
    setListTitle(user.name);
    $('count').textContent = '';
    return renderEmpty('lists');
  }
  renderListItems();
}

function bindTitleEditor(input) {
  input.addEventListener('focus', () => { state.editor = { kind: 'item', id: input.dataset.id, input, composing: false }; });
  input.addEventListener('compositionstart', () => { if (state.editor) state.editor.composing = true; });
  input.addEventListener('compositionend', () => { if (state.editor) state.editor.composing = false; });
  input.addEventListener('blur', () => commitActiveEditor());
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      const item = state.items.find(entry => entry.id === input.dataset.id);
      const isEmptyDraft = item && item.draft && !input.value.trim();
      commitActiveEditor();
      if (!isEmptyDraft) newNote(input.dataset.id);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelActiveEditor();
    }
  });
}

function canOpenItemMenu(target) {
  return !target.closest('.seg');
}

function canStartItemLongPress(target) {
  return !target.closest('input, .seg');
}

function bindItemMenu(card) {
  // Stop a secondary click from focusing the title input before contextmenu fires.
  card.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 2) event.preventDefault();
  });
  card.addEventListener('mousedown', event => {
    if (event.button === 2) event.preventDefault();
  });
  card.addEventListener('contextmenu', event => {
    if (!canOpenItemMenu(event.target)) return;
    event.preventDefault();
    commitActiveEditor();
    openItemMenu(card.dataset.id, event.clientX, event.clientY);
  });
  card.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !canStartItemLongPress(event.target)) return;
    cancelLongPress();
    state.longPress = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, card };
    state.longPress.timer = setTimeout(() => {
      const press = state.longPress;
      if (!press) return;
      state.longPress = null;
      commitActiveEditor();
      openItemMenu(card.dataset.id, press.startX, press.startY);
      if (navigator.vibrate) navigator.vibrate(10);
    }, 500);
  });
  card.addEventListener('pointermove', event => {
    const press = state.longPress;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 10) cancelLongPress();
  });
  card.addEventListener('pointerup', cancelLongPress);
  card.addEventListener('pointercancel', cancelLongPress);
  card.addEventListener('keydown', event => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    openItemMenu(card.dataset.id, rect.left + 12, rect.top + 12);
  });
}

function cancelLongPress() {
  if (!state.longPress) return;
  clearTimeout(state.longPress.timer);
  state.longPress = null;
}

function openItemMenu(id, x, y) {
  if (!state.items.some(entry => entry.id === id)) return;
  cancelLongPress();
  state.contextItemId = id;
  $('itemMenuDelete').textContent = 'Delete item';
  itemMenu.hidden = false;
  const rect = itemMenu.getBoundingClientRect();
  itemMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  itemMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

function closeItemMenu() {
  state.contextItemId = null;
  itemMenu.hidden = true;
}

function commitActiveEditor() {
  const editor = state.editor;
  if (!editor || editor.composing) return;
  state.editor = null;
  let needsRender = editor.kind !== 'item';
  if (editor.kind === 'item') {
    const item = state.items.find(entry => entry.id === editor.id);
    if (item) {
      const title = editor.input.value;
      if (item.draft && !title.trim()) {
        state.items = state.items.filter(entry => entry.id !== item.id);
        needsRender = true;
      }
      else if (title !== item.title || item.draft) {
        item.title = title;
        item.updated = Date.now();
        delete item.draft;
        delete item.draftAfterId;
        saveCache();
        upsertRemoteItem(item);
      }
    }
  } else if (editor.kind === 'list') {
    const entry = state.lists.find(listEntry => listEntry.id === editor.id);
    if (entry) commitListName(entry, editor.input.value);
  } else if (editor.kind === 'user') {
    const user = state.users.find(userEntry => userEntry.id === editor.id);
    if (user) commitUserName(user, editor.input.value);
  }
  saveCache();
  if (needsRender) queueRender();
  if (state.pendingRefresh) scheduleRemoteReload();
}

function cancelActiveEditor() {
  const editor = state.editor;
  if (!editor) return;
  state.editor = null;
  if (editor.kind === 'item') {
    const item = state.items.find(entry => entry.id === editor.id);
    if (item && item.draft) state.items = state.items.filter(entry => entry.id !== item.id);
  }
  queueRender();
}

function newNote(afterId = null) {
  commitActiveEditor();
  const currentList = activeList();
  const user = activeUser();
  if (!currentList || !user) return;
  const now = Date.now();
  const item = { id: uid(), listId: currentList.id, userId: currentList.userId, title: '', status: 'action', priority: 'none', created: now, updated: now, draft: true, draftAfterId: afterId };
  state.items.push(item);
  render();
  requestAnimationFrame(() => {
    const input = list.querySelector(`input.title[data-id="${item.id}"]`);
    if (!input) return;
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    input.closest('.note-row').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function startListRename(entry) {
  commitActiveEditor();
  const title = $('listName');
  const input = document.createElement('input');
  input.id = 'listName';
  input.className = 'header-rename';
  input.value = entry.name;
  title.replaceWith(input);
  state.editor = { kind: 'list', id: entry.id, input, composing: false };
  input.focus(); input.select();
  input.addEventListener('blur', commitActiveEditor);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitActiveEditor(); }
    if (event.key === 'Escape') { event.preventDefault(); cancelActiveEditor(); }
  });
}

function startUserRename(id) {
  const user = state.users.find(entry => entry.id === id);
  if (!user) return;
  const tab = userbar.querySelector(`.user-tab[data-id="${id}"]`);
  if (!tab) return;
  const name = tab.querySelector('.user-name');
  const input = document.createElement('input');
  input.className = 'user-rename';
  input.value = user.name;
  name.replaceWith(input);
  state.editor = { kind: 'user', id, input, composing: false };
  input.focus(); input.select();
  input.addEventListener('blur', commitActiveEditor);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commitActiveEditor(); }
    if (event.key === 'Escape') { event.preventDefault(); cancelActiveEditor(); }
  });
}

function commitListName(entry, value) {
  entry.name = value.trim() || 'To do';
  entry.updatedAt = new Date().toISOString();
  upsertRemoteList(entry);
}

function commitUserName(user, value) {
  user.name = value.trim() || `USER${user.id}`;
  user.updatedAt = new Date().toISOString();
  upsertRemoteUser(user);
}

function switchUser(id) {
  commitActiveEditor();
  setSelection(id);
  render();
}

function switchList(id) {
  const user = activeUser();
  if (!user) return;
  commitActiveEditor();
  setSelection(user.id, id);
  render();
}

async function addUser() {
  commitActiveEditor();
  const listId = uid();
  if (!supabaseClient) {
    const id = Math.max(0, ...state.users.map(user => user.id)) + 1;
    state.users.push({ id, name: `USER${id}`, deletionAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    state.lists.push({ id: listId, userId: id, name: 'To do', position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setSelection(id, listId);
    render();
    requestAnimationFrame(() => startUserRename(id));
    return;
  }
  const { data, error } = await supabaseClient.from('todo_users').insert({ name: '' }).select().single();
  if (error) return reportRemoteError('Could not add user', error);
  const user = remoteUser(data);
  const entry = { id: listId, userId: user.id, name: 'To do', position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const { error: listError } = await supabaseClient.from('todo_lists').insert(listRow(entry));
  if (listError) return reportRemoteError('Could not add default list', listError);
  state.users.push(user);
  state.lists.push(entry);
  setSelection(user.id, entry.id);
  render();
  requestAnimationFrame(() => startUserRename(user.id));
}

function addList() {
  commitActiveEditor();
  const user = activeUser();
  if (!user) return;
  const entry = { id: uid(), userId: user.id, name: 'To do', position: state.lists.filter(listEntry => listEntry.userId === user.id).length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  state.lists.push(entry);
  setSelection(user.id, entry.id);
  render();
  upsertRemoteList(entry);
}

function confirmDeleteList(id) {
  const entry = state.lists.find(listEntry => listEntry.id === id);
  const user = activeUser();
  if (!entry || !user) return;
  const userLists = state.lists.filter(listEntry => listEntry.userId === user.id);
  if (userLists.length === 1) {
    alert('This is your only list - create another before deleting this one.');
    return;
  }
  const count = state.items.filter(item => item.listId === id).length;
  const message = count
    ? `Delete the list "${entry.name}" and its ${count} item${count === 1 ? '' : 's'}? This can't be undone.`
    : `Delete the empty list "${entry.name}"?`;
  if (!confirm(message)) return;
  const index = userLists.findIndex(listEntry => listEntry.id === id);
  state.lists = state.lists.filter(listEntry => listEntry.id !== id);
  state.items = state.items.filter(item => item.listId !== id);
  const next = userLists[Math.max(0, index - 1)];
  setSelection(user.id, next && next.id);
  saveCache();
  render();
  deleteRemoteList(id);
}

function setItemField(id, field, value) {
  const item = state.items.find(entry => entry.id === id);
  if (!item || item[field] === value) return;
  item[field] = value;
  item.updated = Date.now();
  saveCache();
  render();
  upsertRemoteItem(item);
}

async function deleteItem(id) {
  state.items = state.items.filter(item => item.id !== id);
  saveCache();
  render();
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_items').delete().eq('id', id);
  reportRemoteError('Could not delete item', error);
}

async function deleteUser(id) {
  const user = state.users.find(entry => entry.id === id);
  if (!user) return;
  const items = state.items.filter(entry => entry.userId === id).length;
  const message = items
    ? `Delete ${user.name}? Its ${items} item${items === 1 ? '' : 's'} will be hidden now and permanently deleted in one week.`
    : `Delete ${user.name}? It has no items, so it and its empty lists will be permanently deleted.`;
  if (!confirm(message)) return;

  if (supabaseClient) {
    const { data, error } = await supabaseClient.rpc('delete_todo_user', { target_user_id: id }).single();
    if (error) return reportRemoteError('Could not delete user', error);
    if (data && !data.deleted_now) console.info(`${user.name} is scheduled for deletion at ${data.deletion_at}.`);
  }
  state.users = state.users.filter(entry => entry.id !== id);
  state.lists = state.lists.filter(entry => entry.userId !== id);
  state.items = state.items.filter(entry => entry.userId !== id);
  setSelection(activeUser() ? activeUser().id : undefined);
  saveCache();
  render();
}

function itemRow(item) {
  return { id: item.id, list_id: item.listId, user_id: item.userId, title: item.title, status: item.status, priority: item.priority, created: item.created, updated: item.updated };
}

function listRow(entry) {
  return { id: entry.id, user_id: entry.userId, name: entry.name, position: entry.position, updated_at: entry.updatedAt };
}

function userRow(user) { return { id: user.id, name: user.name, deletion_at: user.deletionAt, updated_at: user.updatedAt }; }
function remoteUser(user) { return { id: user.id, name: user.name, deletionAt: user.deletion_at, createdAt: user.created_at, updatedAt: user.updated_at }; }
function remoteList(entry) { return { id: entry.id, userId: entry.user_id, name: entry.name, position: entry.position, createdAt: entry.created_at, updatedAt: entry.updated_at }; }
function remoteItem(item) { return { id: item.id, listId: item.list_id, userId: item.user_id, title: item.title, status: item.status, priority: item.priority, created: item.created, updated: item.updated }; }

async function upsertRemoteItem(item) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_items').upsert(itemRow(item));
  reportRemoteError('Could not save item', error);
}

async function upsertRemoteList(entry) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_lists').upsert(listRow(entry));
  reportRemoteError('Could not save list', error);
}

async function deleteRemoteList(id) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_lists').delete().eq('id', id);
  reportRemoteError('Could not delete list', error);
}

async function upsertRemoteUser(user) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('todo_users').upsert(userRow(user));
  reportRemoteError('Could not save user', error);
}

async function loadRemoteWorkspace() {
  const [usersResult, listsResult, itemsResult] = await Promise.all([
    supabaseClient.from('todo_users').select('*').is('deletion_at', null).order('id'),
    supabaseClient.from('todo_lists').select('*').order('position').order('created_at'),
    supabaseClient.from('todo_items').select('*').order('created')
  ]);
  if (usersResult.error) throw usersResult.error;
  if (listsResult.error) throw listsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  const users = (usersResult.data || []).map(remoteUser);
  const userIds = new Set(users.map(user => user.id));
  return {
    users,
    lists: (listsResult.data || []).map(remoteList).filter(entry => userIds.has(entry.userId)),
    items: (itemsResult.data || []).map(remoteItem).filter(item => userIds.has(item.userId))
  };
}

async function refreshFromRemote() {
  if (!supabaseClient) return;
  if (state.editor) { state.pendingRefresh = true; return; }
  const version = ++state.requestVersion;
  try {
    const workspace = await loadRemoteWorkspace();
    if (version !== state.requestVersion || state.editor) { state.pendingRefresh = true; return; }
    state.users = workspace.users;
    state.lists = workspace.lists;
    state.items = workspace.items;
    state.pendingRefresh = false;
    state.hydrated = true;
    state.loadError = false;
    saveCache();
    render();
  } catch (error) {
    state.hydrated = true;
    state.loadError = true;
    reportRemoteError('Could not load Supabase data', error);
    render();
  }
}

function scheduleRemoteReload() {
  if (state.editor) { state.pendingRefresh = true; return; }
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(refreshFromRemote, 200);
}

function exportBackup() {
  $('menu').hidden = true;
  const payload = { app: 'todo', version: 2, exportedAt: new Date().toISOString(), workspace: { users: state.users, lists: state.lists, items: state.items, selection: state.selection } };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `todo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normaliseImportedWorkspace(data) {
  if (data && data.workspace && Array.isArray(data.workspace.users)) return data.workspace;
  const board = data && data.board ? data.board : data;
  return fromLegacyBoard(board);
}

async function importBackup() {
  $('menu').hidden = true;
  $('importFile').value = '';
  $('importFile').click();
}

$('importFile').addEventListener('change', () => {
  const file = $('importFile').files && $('importFile').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch { alert('That file is not a valid backup.'); return; }
    const workspace = normaliseImportedWorkspace(parsed);
    if (!Array.isArray(workspace.users) || !Array.isArray(workspace.lists) || !Array.isArray(workspace.items)) { alert('That file is not a recognised To do backup.'); return; }
    if (!confirm(`Replace the entire shared workspace with ${workspace.users.length} user${workspace.users.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    if (supabaseClient) {
      const payload = {
        users: workspace.users.map(user => ({ id: user.id, name: user.name, deletion_at: user.deletionAt, created_at: user.createdAt, updated_at: user.updatedAt })),
        lists: workspace.lists.map(entry => listRow(entry)),
        items: workspace.items.map(item => itemRow(item))
      };
      const { error } = await supabaseClient.rpc('replace_todo_workspace', { payload });
      if (error) return reportRemoteError('Could not import backup', error);
    }
    state.users = workspace.users;
    state.lists = workspace.lists;
    state.items = workspace.items;
    state.selection = workspace.selection || {};
    saveCache();
    render();
  };
  reader.readAsText(file);
});

function initialiseRemote() {
  if (!supabaseClient) {
    state.hydrated = true;
    render();
    return;
  }
  renderLoading();
  refreshFromRemote();
  supabaseClient.channel('todo-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_users' }, scheduleRemoteReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists' }, scheduleRemoteReload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, scheduleRemoteReload)
    .subscribe(status => { if (status === 'CHANNEL_ERROR') console.error('Supabase realtime subscription failed.'); });
}

document.addEventListener('click', event => {
  if (!event.target.closest('.seg')) list.querySelectorAll('.seg.expanded').forEach(entry => entry.classList.remove('expanded'));
  if (!event.target.closest('.header-right')) $('menu').hidden = true;
  if (!event.target.closest('.item-menu')) closeItemMenu();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeItemMenu(); });
list.addEventListener('scroll', closeItemMenu, { passive: true });

$('menuBtn').addEventListener('click', event => { event.stopPropagation(); $('menu').hidden = !$('menu').hidden; });
$('exportBtn').addEventListener('click', exportBackup);
$('importBtn').addEventListener('click', importBackup);
$('itemMenuDelete').addEventListener('click', () => {
  const id = state.contextItemId;
  closeItemMenu();
  if (id) deleteItem(id);
});
fab.addEventListener('click', newNote);

initialiseRemote();
