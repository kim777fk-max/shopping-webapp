const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
let currentDate = `${year}-${month}-${day}`;

const dateInput = document.getElementById('current-date');
const displayDate = document.getElementById('display-date');
const shopsContainer = document.getElementById('shops-container');
const monthPlannedTotalEl = document.getElementById('month-planned-total');
const monthActualTotalEl = document.getElementById('month-actual-total');
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

  row.appendChild(check);
  row.appendChild(name);
  row.appendChild(planned);
  row.appendChild(actual);
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

  const addBtn = document.createElement('button');
  addBtn.className = 'add-item-btn';
  addBtn.textContent = '+ 商品を追加';
  addBtn.addEventListener('click', () => {
    currentShopIdForAdd = shop.id;
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-price').value = '';
    itemModal.classList.remove('hidden');
  });

  header.appendChild(shopName);
  header.appendChild(addBtn);

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
    monthPlannedTotalEl.textContent = yen(data.totals?.month_planned || 0);
    monthActualTotalEl.textContent = yen(data.totals?.month_actual || 0);
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
