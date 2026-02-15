const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
let currentDate = `${year}-${month}-${day}`;

const dateInput = document.getElementById('current-date');
const displayDate = document.getElementById('display-date');
const shopsContainer = document.getElementById('shops-container');
const monthActualTotalEl = document.getElementById('month-actual-total');
const monthBudgetEl = document.getElementById('month-budget');
const monthRemainingEl = document.getElementById('month-remaining');
const budgetHintEl = document.getElementById('budget-hint');
const dayPlannedTotalEl = document.getElementById('day-planned-total');
const dayActualTotalEl = document.getElementById('day-actual-total');

const shopModal = document.getElementById('shop-modal');
const itemModal = document.getElementById('item-modal');
let currentShopIdForAdd = null;

function yen(n) {
  const v = Math.round(Number(n || 0));
  return `¥${v.toLocaleString()}`;
}

function apiUrl(path) {
  const base = (window.API_BASE || '').replace(/\/$/, '');
  return `${base}${path}`;
}

async function apiFetch(path, opts = {}) {
  if (!window.API_BASE) {
    throw new Error('API_BASE is not set. Set window.API_BASE in index.html');
  }
  const headers = Object.assign({'Content-Type': 'application/json'}, opts.headers || {});
  if (window.API_TOKEN) {
    headers['Authorization'] = `Bearer ${window.API_TOKEN}`;
  }
  const r = await fetch(apiUrl(path), Object.assign({}, opts, {headers}));
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t);
  }
  return await r.json();
}

async function getDay(d) {
  return await apiFetch(`/day?date=${encodeURIComponent(d)}`, {method: 'GET', headers: {}});
}

async function addShop(d, name) {
  return await apiFetch('/shop', {method: 'POST', body: JSON.stringify({date: d, name})});
}

async function addItem(shop_id, name, planned_price) {
  return await apiFetch('/item', {method: 'POST', body: JSON.stringify({shop_id, name, planned_price})});
}

async function toggleItem(item_id, is_bought) {
  return await apiFetch(`/item/${item_id}/toggle`, {method: 'POST', body: JSON.stringify({is_bought})});
}

async function setActual(item_id, actual_price) {
  return await apiFetch(`/item/${item_id}/actual`, {method: 'POST', body: JSON.stringify({actual_price})});
}

async function setBudget(ym, amount) {
  return await apiFetch('/budget', { method: 'POST', body: JSON.stringify({ ym, amount }) });
}

function createItemRow(item) {
  const row = document.createElement('div');
  row.className = `item-row ${item.is_bought ? 'bought' : ''}`;

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'item-check';
  check.checked = !!item.is_bought;
  check.addEventListener('change', async (e) => {
    await toggleItem(item.id, e.target.checked);
    await updateUI();
  });

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;

  const planned = document.createElement('span');
  planned.className = 'item-price-planned';
  planned.textContent = yen(item.planned_price);

  const actual = document.createElement('input');
  actual.type = 'number';
  actual.className = 'item-price-actual';
  actual.value = item.actual_price ?? item.planned_price;
  actual.placeholder = '実費';
  actual.addEventListener('change', async (e) => {
    await setActual(item.id, Number(e.target.value || 0));
    await updateUI();
  });

  const del = document.createElement('button');
  del.className = 'add-item-btn';
  del.textContent = '×';
  del.title = '削除';
  del.addEventListener('click', async () => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    await apiFetch(`/item/${item.id}`, { method: 'DELETE', headers: {} });
    await updateUI();
  });

  row.appendChild(check);
  row.appendChild(name);
  row.appendChild(planned);
  row.appendChild(actual);
  row.appendChild(del);
  return row;
}

function createShopCard(shop) {
  const div = document.createElement('div');
  div.className = 'shop-card';

  const header = document.createElement('div');
  header.className = 'shop-header';

  const shopName = document.createElement('span');
  shopName.className = 'shop-name';
  shopName.textContent = shop.name;

  const actions = document.createElement('div');

  const addBtn = document.createElement('button');
  addBtn.className = 'add-item-btn';
  addBtn.textContent = '+ 商品を追加';
  addBtn.addEventListener('click', () => {
    currentShopIdForAdd = shop.id;
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-price').value = '';
    itemModal.classList.remove('hidden');
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'add-item-btn';
  delBtn.textContent = '削除';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`「${shop.name}」を削除しますか？（中の商品も消えます）`)) return;
    await apiFetch(`/shop/${shop.id}`, { method: 'DELETE', headers: {} });
    await updateUI();
  });

  actions.appendChild(addBtn);
  actions.appendChild(delBtn);

  header.appendChild(shopName);
  header.appendChild(actions);

  const list = document.createElement('div');
  list.className = 'items-list';
  (shop.items || []).forEach(item => list.appendChild(createItemRow(item)));

  div.appendChild(header);
  div.appendChild(list);
  return div;
}

async function updateUI() {
  displayDate.textContent = new Date(currentDate).toLocaleDateString('ja-JP', {month: 'long', day: 'numeric', weekday: 'short'});
  try {
    const data = await getDay(currentDate);
    shopsContainer.innerHTML = '';
    (data.shops || []).forEach(shop => shopsContainer.appendChild(createShopCard(shop)));
    dayPlannedTotalEl.textContent = yen(data.totals?.day_planned || 0);
    dayActualTotalEl.textContent = yen(data.totals?.day_actual || 0);
    monthActualTotalEl.textContent = yen(data.totals?.month_actual || 0);

    const budget = Number(data.budget?.amount || 0);
    const ym = String(data.budget?.ym || currentDate.slice(0,7));
    if (monthBudgetEl) monthBudgetEl.value = budget ? String(Math.round(budget)) : '';
    const remaining = budget - Number(data.totals?.month_actual || 0);
    if (monthRemainingEl) monthRemainingEl.textContent = yen(remaining);
    if (budgetHintEl) budgetHintEl.textContent = ym ? `${ym} の予算` : '';

    const remEl = monthRemainingEl;
    if (remEl) {
      remEl.style.color = remaining < 0 ? '#c53030' : '';
    }
  } catch (e) {
    shopsContainer.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = `APIエラー: ${e.message}`;
    shopsContainer.appendChild(err);
  }
}

function setupEventListeners() {
  dateInput.addEventListener('change', async (e) => {
    currentDate = e.target.value;
    await updateUI();
  });

  document.getElementById('prev-day').addEventListener('click', async () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    currentDate = d.toISOString().split('T')[0];
    dateInput.value = currentDate;
    await updateUI();
  });

  document.getElementById('next-day').addEventListener('click', async () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    currentDate = d.toISOString().split('T')[0];
    dateInput.value = currentDate;
    await updateUI();
  });

  document.getElementById('add-shop-btn').addEventListener('click', () => {
    document.getElementById('new-shop-name').value = '';
    shopModal.classList.remove('hidden');
  });

  const saveBudgetBtn = document.getElementById('save-budget');
  if (saveBudgetBtn) {
    saveBudgetBtn.addEventListener('click', async () => {
      const ym = currentDate.slice(0, 7);
      const amount = Number(monthBudgetEl?.value || 0);
      await setBudget(ym, amount);
      await updateUI();
    });
  }

  document.getElementById('cancel-shop').addEventListener('click', () => {
    shopModal.classList.add('hidden');
  });

  document.getElementById('save-shop').addEventListener('click', async () => {
    const name = document.getElementById('new-shop-name').value?.trim();
    if (!name) return;
    await addShop(currentDate, name);
    shopModal.classList.add('hidden');
    await updateUI();
  });

  document.getElementById('cancel-item').addEventListener('click', () => {
    itemModal.classList.add('hidden');
  });

  document.getElementById('save-item').addEventListener('click', async () => {
    const name = document.getElementById('new-item-name').value?.trim();
    const price = Number(document.getElementById('new-item-price').value || 0);
    if (!name || !currentShopIdForAdd) return;
    await addItem(currentShopIdForAdd, name, price);
    itemModal.classList.add('hidden');
    await updateUI();
  });

  window.addEventListener('click', (e) => {
    if (e.target === shopModal) shopModal.classList.add('hidden');
    if (e.target === itemModal) itemModal.classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  dateInput.value = currentDate;
  setupEventListeners();
  await updateUI();
});
