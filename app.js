/* ============================================================
   Contador de Calorías — App principal
   ============================================================ */

const STORAGE_KEY = 'cal-counter-v1';
const AUTH_KEY = 'cal-counter-auth-v1';
const LOCAL_USERS = [{ user: 'Admin', pass: 'contador', name: 'Admin' }];
const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 250, fat: 65 };
const DEFAULT_REMINDERS = { enabled: false, time: '21:00', dismissedDate: '' };
const DEFAULT_BODY = { sex: 'male', age: 30, weight: 70, height: 170, activity: 1.55, goal: 'maintain', proteinRatio: 1.8 };

const state = {
  foods: [],
  log: {},
  settings: {
    apiKey: '',
    goals: { ...DEFAULT_GOALS },
    reminders: { ...DEFAULT_REMINDERS },
    body: { ...DEFAULT_BODY },
  },
  currentMeal: null,
  selectedFood: null,
  editingFoodId: null,
  pendingCalc: null,        // resultados del calculador antes de aplicar
  reminderTimer: null,
};

/* ---------- Storage ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.foods = data.foods || [];
    state.log = data.log || {};
    state.settings = {
      apiKey: data.settings?.apiKey || '',
      goals: { ...DEFAULT_GOALS, ...(data.settings?.goals || {}) },
      reminders: { ...DEFAULT_REMINDERS, ...(data.settings?.reminders || {}) },
      body: { ...DEFAULT_BODY, ...(data.settings?.body || {}) },
    };
  } catch (e) {
    console.error('Error cargando datos:', e);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    foods: state.foods,
    log: state.log,
    settings: state.settings,
  }));
}

/* ---------- Auth ---------- */
function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

function showLogin() {
  document.documentElement.classList.add('app-locked');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const u = document.getElementById('loginUser');
    if (u) u.focus();
  }, 100);
}

function hideLogin() {
  document.documentElement.classList.remove('app-locked');
  document.body.style.overflow = '';
}

function setupLogin(onLoginSuccess) {
  const form = document.getElementById('formLogin');
  const errorEl = document.getElementById('loginError');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const match = LOCAL_USERS.find(x => x.user === u && x.pass === p);
    if (!match) {
      errorEl.textContent = 'Usuario o contraseña incorrectos';
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');
    saveAuth({
      user: { id: match.user.toLowerCase(), name: match.name, provider: 'local' },
      loggedInAt: Date.now(),
    });
    document.getElementById('loginPass').value = '';
    hideLogin();
    onLoginSuccess();
  });

  document.querySelectorAll('.social-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      const labels = { google: 'Google', apple: 'Apple', meta: 'Meta' };
      toast(`${labels[provider] || provider}: integración próximamente`, 'info');
    });
  });
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  clearAuth();
  location.reload();
}

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDate(d) {
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  return d.toLocaleDateString('es-ES', opts);
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 2200);
}

function round(n, dec = 1) {
  const p = Math.pow(10, dec);
  return Math.round(n * p) / p;
}

/* ---------- Image handling ---------- */
function fileToDataURL(file, maxSize = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Open Food Facts ---------- */
async function fetchOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?lc=es&fields=product_name,product_name_es,brands,image_url,image_front_url,image_front_small_url,nutriments,serving_size,serving_quantity,quantity`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OFF: HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error('Producto no encontrado en Open Food Facts');
  }
  const p = data.product;
  const n = p.nutriments || {};
  const name = p.product_name_es || p.product_name || p.brands || `Producto ${barcode}`;
  const photoUrl = p.image_front_url || p.image_url || p.image_front_small_url || '';
  return {
    barcode,
    name: name.trim(),
    portion: 100,
    unit: 'g',
    calories: round(n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : 0)),
    protein: round(n.proteins_100g || 0),
    carbs: round(n.carbohydrates_100g || 0),
    fat: round(n.fat_100g || 0),
    photoUrl,
  };
}

async function searchOFFByName(query) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,product_name_es,brands,image_front_url,image_front_small_url,nutriments`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.products || [];
}

async function urlToDataURL(url, maxSize = 600) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return '';
    const blob = await res.blob();
    return await fileToDataURL(blob, maxSize);
  } catch (e) {
    console.warn('No se pudo descargar la foto:', e);
    return '';
  }
}

/* ---------- Scanner (ZXing) ---------- */
let scanReader = null;
let scanMode = 'register';      // 'register' = abre form para guardar; 'log' = agrega al diario directo
let scanTargetMeal = null;

async function startScanner() {
  const video = $('#scanVideo');
  const status = $('#scanStatus');
  status.className = 'scan-status';
  status.textContent = 'Iniciando cámara...';

  if (!window.ZXing) {
    status.textContent = 'No se pudo cargar el lector. Verifica tu conexión a internet.';
    status.className = 'scan-status error';
    return;
  }
  const reader = new window.ZXing.BrowserMultiFormatReader();
  scanReader = reader;

  try {
    let deviceId;
    try {
      const devices = await reader.listVideoInputDevices();
      const back = devices.find(d => /back|rear|environment|trasera/i.test(d.label)) || devices[devices.length - 1];
      deviceId = back?.deviceId;
    } catch { deviceId = undefined; }

    status.textContent = 'Apunta la cámara al código...';
    reader.decodeFromVideoDevice(deviceId, video, async (result) => {
      if (result && scanReader) {
        const code = result.getText();
        try { scanReader.reset(); } catch {}
        scanReader = null;
        await onBarcodeDetected(code);
      }
    });
  } catch (err) {
    console.error(err);
    status.textContent = 'No se pudo acceder a la cámara: ' + err.message;
    status.className = 'scan-status error';
  }
}

function stopScanner() {
  if (scanReader) {
    try { scanReader.reset(); } catch (e) {}
    scanReader = null;
  }
  const video = $('#scanVideo');
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

async function onBarcodeDetected(code) {
  const status = $('#scanStatus');
  status.textContent = `Código detectado: ${code} — buscando...`;
  status.className = 'scan-status';

  // Si ya existe un alimento con ese código
  const existing = state.foods.find(f => f.barcode === code);
  if (existing) {
    closeScanModal();
    if (scanMode === 'log') {
      state.currentMeal = scanTargetMeal;
      closeModal($('#modalLog'));
      openAmountModal(existing);
      toast('Producto encontrado — ajusta cantidad', 'success');
    } else {
      openFoodModal(existing.id);
      toast('Alimento existente abierto para editar', 'success');
    }
    return;
  }

  try {
    const product = await fetchOpenFoodFacts(code);
    status.textContent = `✓ Encontrado: ${product.name}`;
    status.className = 'scan-status success';

    let photoData = '';
    if (product.photoUrl) {
      status.textContent = '✓ Encontrado. Descargando imagen...';
      photoData = await urlToDataURL(product.photoUrl);
    }

    if (scanMode === 'log') {
      // Crear alimento + abrir modal de cantidad para el meal actual
      const newFood = {
        id: uid(),
        name: product.name,
        barcode: product.barcode,
        portion: product.portion,
        unit: product.unit,
        calories: product.calories,
        protein: product.protein,
        carbs: product.carbs,
        fat: product.fat,
        photo: photoData,
        updatedAt: Date.now(),
      };
      state.foods.push(newFood);
      save();
      renderFoods($('#searchFoods').value);
      closeScanModal();
      closeModal($('#modalLog'));
      state.currentMeal = scanTargetMeal;
      openAmountModal(newFood);
      toast('Producto agregado al catálogo', 'success');
    } else {
      closeScanModal();
      prefillFoodModal({ ...product, photo: photoData });
      toast('Producto cargado de Open Food Facts', 'success');
    }
  } catch (err) {
    status.textContent = err.message + ' — completa los datos manualmente.';
    status.className = 'scan-status error';
    setTimeout(() => {
      closeScanModal();
      if (scanMode === 'log') closeModal($('#modalLog'));
      prefillFoodModal({ barcode: code, name: '', portion: 100, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, photo: '' });
    }, 1500);
  }
}

function openScanModal(mode = 'register', meal = null) {
  scanMode = mode;
  scanTargetMeal = meal;
  $('#manualBarcode').value = '';
  $('#scanStatus').textContent = '';
  $('#modalScan').classList.remove('hidden');
  startScanner();
}

function closeScanModal() {
  stopScanner();
  $('#modalScan').classList.add('hidden');
}

async function lookupManualBarcode() {
  const code = $('#manualBarcode').value.trim();
  if (!code) {
    toast('Ingresa un código', 'error');
    return;
  }
  await onBarcodeDetected(code);
}

function prefillFoodModal(data) {
  openFoodModal(); // abre vacío
  $('#foodId').value = '';
  $('#foodName').value = data.name || '';
  $('#foodBarcode').value = data.barcode || '';
  $('#foodPortion').value = data.portion || 100;
  $('#foodUnit').value = data.unit || 'g';
  $('#foodCalories').value = data.calories || 0;
  $('#foodProteinIn').value = data.protein || 0;
  $('#foodCarbsIn').value = data.carbs || 0;
  $('#foodFatIn').value = data.fat || 0;
  if (data.photo) {
    const prev = $('#photoPreview');
    prev.style.backgroundImage = `url('${data.photo}')`;
    prev.classList.add('has-image');
    prev.dataset.photo = data.photo;
  }
}

/* ---------- OFF Search Modal ---------- */
function openOffSearchModal() {
  $('#offSearchQuery').value = $('#foodName').value || '';
  $('#offSearchResults').innerHTML = '';
  $('#offSearchStatus').textContent = '';
  $('#offSearchStatus').className = 'ai-status';
  $('#modalOffSearch').classList.remove('hidden');
  setTimeout(() => $('#offSearchQuery').focus(), 100);
}

async function runOffSearch() {
  const q = $('#offSearchQuery').value.trim();
  if (!q || q.length < 2) {
    $('#offSearchStatus').textContent = 'Escribe al menos 2 letras';
    $('#offSearchStatus').className = 'ai-status error';
    return;
  }
  $('#offSearchStatus').textContent = 'Buscando en Open Food Facts...';
  $('#offSearchStatus').className = 'ai-status';
  $('#offSearchResults').innerHTML = '';
  try {
    const results = await searchOFFByName(q);
    const valid = results.filter(p => {
      const n = p.nutriments || {};
      return (n['energy-kcal_100g'] || n.energy_100g) && (p.product_name_es || p.product_name);
    });
    if (!valid.length) {
      $('#offSearchStatus').textContent = 'Sin resultados con datos nutricionales';
      $('#offSearchStatus').className = 'ai-status error';
      return;
    }
    $('#offSearchStatus').textContent = `${valid.length} resultados`;
    $('#offSearchStatus').className = 'ai-status success';
    renderOffResults(valid);
  } catch (err) {
    $('#offSearchStatus').textContent = 'Error: ' + err.message;
    $('#offSearchStatus').className = 'ai-status error';
  }
}

function renderOffResults(products) {
  const list = $('#offSearchResults');
  list.innerHTML = '';
  products.forEach(p => {
    const n = p.nutriments || {};
    const cal = round(n['energy-kcal_100g'] || (n.energy_100g ? n.energy_100g / 4.184 : 0));
    const item = document.createElement('div');
    item.className = 'off-result';
    const name = p.product_name_es || p.product_name || 'Sin nombre';
    item.innerHTML = `
      <div class="off-thumb" ${p.image_front_small_url ? `style="background-image:url('${p.image_front_small_url}')"` : ''}>${p.image_front_small_url ? '' : '🍽️'}</div>
      <div class="off-info">
        <p class="off-name">${escapeHtml(name)}</p>
        ${p.brands ? `<p class="off-brand">${escapeHtml(p.brands)}</p>` : ''}
        <p class="off-macros">${cal} kcal · P${round(n.proteins_100g || 0)} C${round(n.carbohydrates_100g || 0)} G${round(n.fat_100g || 0)} (por 100g)</p>
      </div>
    `;
    item.addEventListener('click', () => selectOffResult(p));
    list.appendChild(item);
  });
}

async function selectOffResult(p) {
  const status = $('#offSearchStatus');
  status.textContent = 'Cargando producto...';
  status.className = 'ai-status';
  const n = p.nutriments || {};
  let photo = '';
  if (p.image_front_url || p.image_front_small_url) {
    photo = await urlToDataURL(p.image_front_url || p.image_front_small_url);
  }
  const data = {
    barcode: p.code || '',
    name: (p.product_name_es || p.product_name || '').trim(),
    portion: 100,
    unit: 'g',
    calories: round(n['energy-kcal_100g'] || (n.energy_100g ? n.energy_100g / 4.184 : 0)),
    protein: round(n.proteins_100g || 0),
    carbs: round(n.carbohydrates_100g || 0),
    fat: round(n.fat_100g || 0),
    photo,
  };
  closeModal($('#modalOffSearch'));
  // Si ya estamos en un food modal abierto, solo rellenamos sin reabrirlo
  if (!$('#modalFood').classList.contains('hidden')) {
    fillFoodForm(data);
  } else {
    prefillFoodModal(data);
  }
  toast('Producto cargado', 'success');
}

function fillFoodForm(data) {
  $('#foodName').value = data.name || '';
  $('#foodBarcode').value = data.barcode || '';
  $('#foodPortion').value = data.portion || 100;
  $('#foodUnit').value = data.unit || 'g';
  $('#foodCalories').value = data.calories || 0;
  $('#foodProteinIn').value = data.protein || 0;
  $('#foodCarbsIn').value = data.carbs || 0;
  $('#foodFatIn').value = data.fat || 0;
  if (data.photo) {
    const prev = $('#photoPreview');
    prev.style.backgroundImage = `url('${data.photo}')`;
    prev.classList.add('has-image');
    prev.dataset.photo = data.photo;
  }
}

/* ---------- AI: Claude API ---------- */
async function aiCalculateMacros(name, portion, unit) {
  const apiKey = state.settings.apiKey;
  if (!apiKey) {
    throw new Error('Configura tu API Key en ⚙ para usar IA');
  }
  const prompt = `Eres un experto en nutrición. Para el alimento "${name}" en una porción de ${portion} ${unit}, devuelve SOLO un JSON con valores nutricionales estimados promedio (sin texto adicional). Formato exacto:
{"calories": <kcal>, "protein": <g>, "carbs": <g>, "fat": <g>}

Si el alimento es ambiguo, asume preparación común. Usa números (no strings). Sin explicaciones.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API: ${res.status} — ${errText.slice(0, 120)}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Respuesta IA inválida');
  const macros = JSON.parse(match[0]);
  return {
    calories: round(macros.calories || 0),
    protein: round(macros.protein || 0),
    carbs: round(macros.carbs || 0),
    fat: round(macros.fat || 0),
  };
}

/* ---------- Tabs ---------- */
function setupTabs() {
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $(`#tab-${t.dataset.tab}`).classList.add('active');
    if (t.dataset.tab === 'stats') renderStats();
  }));
}

/* ---------- Render: Today ---------- */
function renderToday() {
  const day = state.log[todayKey()] || [];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  ['desayuno', 'almuerzo', 'cena', 'snack'].forEach(meal => {
    const ul = $(`#meal-${meal}`);
    ul.innerHTML = '';
    const items = day.filter(e => e.meal === meal);
    items.forEach(entry => {
      const food = state.foods.find(f => f.id === entry.foodId);
      if (!food) return;
      const factor = entry.amount / food.portion;
      const cal = food.calories * factor;
      totals.calories += cal;
      totals.protein += food.protein * factor;
      totals.carbs += food.carbs * factor;
      totals.fat += food.fat * factor;

      const li = document.createElement('li');
      li.className = 'meal-item';
      li.innerHTML = `
        <div class="meal-item-thumb" ${food.photo ? `style="background-image:url('${food.photo}')"` : ''}>${food.photo ? '' : '🍽️'}</div>
        <div class="meal-item-info">
          <div class="meal-item-name">${escapeHtml(food.name)}</div>
          <div class="meal-item-meta">${round(entry.amount)} ${food.unit}</div>
        </div>
        <div class="meal-item-actions">
          <span class="meal-item-cal">${Math.round(cal)} kcal</span>
          <button class="meal-item-del" data-entry="${entry.id}" aria-label="Eliminar">✕</button>
        </div>
      `;
      ul.appendChild(li);
    });
  });

  // Bind delete buttons
  $$('.meal-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.entry;
      state.log[todayKey()] = (state.log[todayKey()] || []).filter(e => e.id !== id);
      save();
      renderToday();
    });
  });

  // Update summary
  const goals = state.settings.goals;
  $('#totalCalories').textContent = Math.round(totals.calories);
  $('#goalCalories').textContent = `/ ${goals.calories} kcal`;
  $('#totalProtein').textContent = Math.round(totals.protein);
  $('#totalCarbs').textContent = Math.round(totals.carbs);
  $('#totalFat').textContent = Math.round(totals.fat);
  $('#goalProtein').textContent = `de ${goals.protein}g`;
  $('#goalCarbs').textContent = `de ${goals.carbs}g`;
  $('#goalFat').textContent = `de ${goals.fat}g`;

  const circumference = 2 * Math.PI * 50;
  const pct = Math.min(totals.calories / goals.calories, 1);
  $('#ringCalories').style.strokeDashoffset = circumference * (1 - pct);
  $('#ringCalories').style.stroke = totals.calories > goals.calories
    ? 'url(#ringGradOver)'
    : 'url(#ringGrad)';

  $('#barProtein').style.width = `${Math.min(totals.protein / goals.protein * 100, 100)}%`;
  $('#barCarbs').style.width = `${Math.min(totals.carbs / goals.carbs * 100, 100)}%`;
  $('#barFat').style.width = `${Math.min(totals.fat / goals.fat * 100, 100)}%`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- Render: Foods ---------- */
function renderFoods(filter = '') {
  const container = $('#foodsList');
  container.innerHTML = '';
  const q = filter.trim().toLowerCase();
  const filtered = state.foods
    .filter(f => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  $('#emptyFoods').classList.toggle('hidden', filtered.length > 0);

  filtered.forEach(food => {
    const card = document.createElement('div');
    card.className = 'food-card';
    card.innerHTML = `
      <div class="food-photo" ${food.photo ? `style="background-image:url('${food.photo}')"` : ''}>${food.photo ? '' : '🍽️'}</div>
      <div class="food-info">
        <p class="food-name">${escapeHtml(food.name)}</p>
        <p class="food-portion">${food.portion} ${food.unit}</p>
        <div class="food-macros">
          <span class="cal">${Math.round(food.calories)} kcal</span>
          <span class="p">P${Math.round(food.protein)}</span>
          <span class="c">C${Math.round(food.carbs)}</span>
          <span class="f">G${Math.round(food.fat)}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openFoodModal(food.id));
    container.appendChild(card);
  });
}

/* ---------- Render: Stats ---------- */
function renderStats() {
  const today = new Date();
  let total = 0, days = 0;
  const usage = {};
  const week = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entries = state.log[key] || [];
    let dayCal = 0;
    entries.forEach(e => {
      const food = state.foods.find(f => f.id === e.foodId);
      if (!food) return;
      const factor = e.amount / food.portion;
      dayCal += food.calories * factor;
      usage[food.id] = (usage[food.id] || 0) + 1;
    });
    if (entries.length) { total += dayCal; days++; }
    week.push({ date: d, calories: dayCal });
  }

  $('#stat7Avg').textContent = days ? `${Math.round(total / days)} kcal` : '— kcal';
  $('#statDays').textContent = days;

  const top = Object.entries(usage).sort((a, b) => b[1] - a[1])[0];
  $('#statTopFood').textContent = top
    ? (state.foods.find(f => f.id === top[0])?.name || '—')
    : '—';

  const max = Math.max(...week.map(d => d.calories), state.settings.goals.calories);
  const chart = $('#weekChart');
  chart.innerHTML = '';
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  week.forEach(d => {
    const bar = document.createElement('div');
    bar.className = 'week-bar';
    const h = max > 0 ? (d.calories / max) * 100 : 0;
    bar.innerHTML = `
      <div class="week-bar-fill" style="height:${h}%" data-cal="${Math.round(d.calories)}"></div>
      <span class="week-bar-label">${dayNames[d.date.getDay()]}</span>
    `;
    chart.appendChild(bar);
  });
}

/* ---------- Modal: Food (new/edit) ---------- */
function openFoodModal(id = null) {
  state.editingFoodId = id;
  const modal = $('#modalFood');
  $('#modalFoodTitle').textContent = id ? 'Editar alimento' : 'Nuevo alimento';
  $('#btnDeleteFood').classList.toggle('hidden', !id);
  $('#aiStatus').textContent = '';
  $('#aiStatus').className = 'ai-status';

  if (id) {
    const f = state.foods.find(x => x.id === id);
    $('#foodId').value = f.id;
    $('#foodName').value = f.name;
    $('#foodBarcode').value = f.barcode || '';
    $('#foodPortion').value = f.portion;
    $('#foodUnit').value = f.unit;
    $('#foodCalories').value = f.calories;
    $('#foodProteinIn').value = f.protein;
    $('#foodCarbsIn').value = f.carbs;
    $('#foodFatIn').value = f.fat;
    const prev = $('#photoPreview');
    if (f.photo) {
      prev.style.backgroundImage = `url('${f.photo}')`;
      prev.classList.add('has-image');
      prev.dataset.photo = f.photo;
    } else {
      prev.style.backgroundImage = '';
      prev.classList.remove('has-image');
      delete prev.dataset.photo;
    }
  } else {
    $('#formFood').reset();
    $('#foodId').value = '';
    const prev = $('#photoPreview');
    prev.style.backgroundImage = '';
    prev.classList.remove('has-image');
    delete prev.dataset.photo;
  }
  modal.classList.remove('hidden');
}

function closeModal(modal) { modal.classList.add('hidden'); }

async function handleFoodSubmit(e) {
  e.preventDefault();
  const id = $('#foodId').value || uid();
  const photo = $('#photoPreview').dataset.photo || '';
  const food = {
    id,
    name: $('#foodName').value.trim(),
    barcode: $('#foodBarcode').value.trim(),
    portion: parseFloat($('#foodPortion').value) || 0,
    unit: $('#foodUnit').value,
    calories: parseFloat($('#foodCalories').value) || 0,
    protein: parseFloat($('#foodProteinIn').value) || 0,
    carbs: parseFloat($('#foodCarbsIn').value) || 0,
    fat: parseFloat($('#foodFatIn').value) || 0,
    photo,
    updatedAt: Date.now(),
  };
  if (!food.name || !food.portion) {
    toast('Nombre y porción son obligatorios', 'error');
    return;
  }
  const idx = state.foods.findIndex(f => f.id === id);
  if (idx >= 0) state.foods[idx] = food;
  else state.foods.push(food);
  save();
  renderFoods($('#searchFoods').value);
  renderToday();
  closeModal($('#modalFood'));
  toast(idx >= 0 ? 'Alimento actualizado' : 'Alimento agregado', 'success');
}

function handleDeleteFood() {
  const id = $('#foodId').value;
  if (!id) return;
  if (!confirm('¿Eliminar este alimento? Las entradas del diario asociadas no se borrarán pero perderán referencia.')) return;
  state.foods = state.foods.filter(f => f.id !== id);
  save();
  renderFoods($('#searchFoods').value);
  renderToday();
  closeModal($('#modalFood'));
  toast('Alimento eliminado');
}

/* ---------- Photo picker ---------- */
async function handlePhotoChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file);
    const prev = $('#photoPreview');
    prev.style.backgroundImage = `url('${dataUrl}')`;
    prev.classList.add('has-image');
    prev.dataset.photo = dataUrl;
  } catch (err) {
    toast('Error al cargar foto', 'error');
  }
}

/* ---------- AI button ---------- */
async function handleAIClick() {
  const name = $('#foodName').value.trim();
  const portion = parseFloat($('#foodPortion').value);
  const unit = $('#foodUnit').value;
  if (!name || !portion) {
    $('#aiStatus').textContent = 'Ingresa nombre y porción primero';
    $('#aiStatus').className = 'ai-status error';
    return;
  }
  const btn = $('#btnAI');
  btn.disabled = true;
  $('#aiStatus').textContent = 'Calculando con IA...';
  $('#aiStatus').className = 'ai-status';
  try {
    const macros = await aiCalculateMacros(name, portion, unit);
    $('#foodCalories').value = macros.calories;
    $('#foodProteinIn').value = macros.protein;
    $('#foodCarbsIn').value = macros.carbs;
    $('#foodFatIn').value = macros.fat;
    $('#aiStatus').textContent = '✓ Macros calculados (puedes editarlos)';
    $('#aiStatus').className = 'ai-status success';
  } catch (err) {
    $('#aiStatus').textContent = err.message;
    $('#aiStatus').className = 'ai-status error';
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Modal: Log (add to meal) ---------- */
function openLogModal(meal) {
  state.currentMeal = meal;
  $('#modalLogMeal').textContent = meal;
  $('#logSearch').value = '';
  renderLogFoodsList('');
  $('#modalLog').classList.remove('hidden');
  setTimeout(() => $('#logSearch').focus(), 100);
}

function renderLogFoodsList(q) {
  const list = $('#logFoodsList');
  list.innerHTML = '';
  const query = q.trim().toLowerCase();
  const items = state.foods
    .filter(f => !query || f.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (items.length === 0) {
    list.innerHTML = `<p class="empty">No hay alimentos. Crea uno en la pestaña <strong>Alimentos</strong>.</p>`;
    return;
  }

  items.forEach(food => {
    const item = document.createElement('div');
    item.className = 'log-food-item';
    item.innerHTML = `
      <div class="log-food-thumb" ${food.photo ? `style="background-image:url('${food.photo}')"` : ''}>${food.photo ? '' : '🍽️'}</div>
      <div>
        <p class="log-food-info-name">${escapeHtml(food.name)}</p>
        <p class="log-food-info-meta">${food.portion} ${food.unit} · P${Math.round(food.protein)} C${Math.round(food.carbs)} G${Math.round(food.fat)}</p>
      </div>
      <span class="log-food-cal">${Math.round(food.calories)} kcal</span>
    `;
    item.addEventListener('click', () => openAmountModal(food));
    list.appendChild(item);
  });
}

/* ---------- Modal: Amount ---------- */
function openAmountModal(food) {
  state.selectedFood = food;
  closeModal($('#modalLog'));
  $('#modalAmountTitle').textContent = food.name;
  $('#amountInfo').textContent =
    `Porción base: ${food.portion} ${food.unit} = ${Math.round(food.calories)} kcal · P${Math.round(food.protein)}g C${Math.round(food.carbs)}g G${Math.round(food.fat)}g`;
  $('#amountValue').value = food.portion;
  $('#amountUnit').textContent = food.unit;
  updateAmountPreview();
  $('#modalAmount').classList.remove('hidden');
  setTimeout(() => $('#amountValue').select(), 100);
}

function updateAmountPreview() {
  const food = state.selectedFood;
  if (!food) return;
  const amount = parseFloat($('#amountValue').value) || 0;
  const factor = amount / food.portion;
  const cal = food.calories * factor;
  $('#amountPreview').textContent = amount > 0
    ? `${Math.round(cal)} kcal · P${round(food.protein * factor)} C${round(food.carbs * factor)} G${round(food.fat * factor)}`
    : '';
}

function handleAmountSubmit(e) {
  e.preventDefault();
  const amount = parseFloat($('#amountValue').value);
  if (!amount || amount <= 0) {
    toast('Cantidad inválida', 'error');
    return;
  }
  const key = todayKey();
  if (!state.log[key]) state.log[key] = [];
  state.log[key].push({
    id: uid(),
    foodId: state.selectedFood.id,
    amount,
    meal: state.currentMeal,
    time: Date.now(),
  });
  save();
  renderToday();
  closeModal($('#modalAmount'));
  toast('Agregado al diario', 'success');
}

/* ---------- Modal: Settings ---------- */
function openSettings() {
  $('#setGoalCalories').value = state.settings.goals.calories;
  $('#setGoalProtein').value = state.settings.goals.protein;
  $('#setGoalCarbs').value = state.settings.goals.carbs;
  $('#setGoalFat').value = state.settings.goals.fat;
  $('#setApiKey').value = state.settings.apiKey;
  $('#setReminderEnabled').checked = state.settings.reminders.enabled;
  $('#setReminderTime').value = state.settings.reminders.time;
  // Estado de permiso
  if ('Notification' in window) updateNotifStatus(Notification.permission);
  else if (window.Capacitor?.Plugins?.LocalNotifications) updateNotifStatus('default');
  else updateNotifStatus('unsupported');
  $('#modalSettings').classList.remove('hidden');
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  state.settings.goals = {
    calories: parseInt($('#setGoalCalories').value) || DEFAULT_GOALS.calories,
    protein: parseInt($('#setGoalProtein').value) || DEFAULT_GOALS.protein,
    carbs: parseInt($('#setGoalCarbs').value) || DEFAULT_GOALS.carbs,
    fat: parseInt($('#setGoalFat').value) || DEFAULT_GOALS.fat,
  };
  state.settings.apiKey = $('#setApiKey').value.trim();

  const wasEnabled = state.settings.reminders.enabled;
  state.settings.reminders.enabled = $('#setReminderEnabled').checked;
  state.settings.reminders.time = $('#setReminderTime').value || '21:00';
  // Si se activa el recordatorio sin permiso de notificación, pedirlo
  if (state.settings.reminders.enabled && !wasEnabled) {
    requestNotificationPermission();
  }

  save();
  scheduleReminder();
  renderToday();
  checkInAppReminder();
  closeModal($('#modalSettings'));
  toast('Configuración guardada', 'success');
}

/* ---------- Export / Import / Reset ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({
    foods: state.foods,
    log: state.log,
    settings: { goals: state.settings.goals },
    exportedAt: new Date().toISOString(),
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contador-calorias-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('Importar reemplazará tus datos actuales. ¿Continuar?')) return;
      if (data.foods) state.foods = data.foods;
      if (data.log) state.log = data.log;
      if (data.settings?.goals) state.settings.goals = { ...DEFAULT_GOALS, ...data.settings.goals };
      save();
      renderToday();
      renderFoods();
      closeModal($('#modalSettings'));
      toast('Datos importados', 'success');
    } catch (err) {
      toast('Archivo inválido', 'error');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('¿Borrar TODOS los datos (alimentos, diario y configuración)? Esta acción es irreversible.')) return;
  if (!confirm('Confirma una vez más: ¿borrar todo?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state.foods = [];
  state.log = {};
  state.settings = { apiKey: '', goals: { ...DEFAULT_GOALS } };
  renderToday();
  renderFoods();
  closeModal($('#modalSettings'));
  toast('Datos eliminados');
}

/* ---------- Calculadora de objetivos (Mifflin-St Jeor) ---------- */
function openCalcModal() {
  const b = state.settings.body;
  $('#calcSex').value = b.sex;
  $('#calcAge').value = b.age;
  $('#calcWeight').value = b.weight;
  $('#calcHeight').value = b.height;
  $('#calcActivity').value = String(b.activity);
  $('#calcGoal').value = b.goal;
  $('#calcProteinRatio').value = String(b.proteinRatio);
  $('#calcResult').classList.add('hidden');
  $('#btnCalcApply').disabled = true;
  state.pendingCalc = null;
  $('#modalCalc').classList.remove('hidden');
}

function computeCalc() {
  const sex = $('#calcSex').value;
  const age = parseInt($('#calcAge').value);
  const weight = parseFloat($('#calcWeight').value);
  const height = parseInt($('#calcHeight').value);
  const activity = parseFloat($('#calcActivity').value);
  const goal = $('#calcGoal').value;
  const proteinRatio = parseFloat($('#calcProteinRatio').value);

  if (!age || !weight || !height) {
    toast('Completa edad, peso y altura', 'error');
    return;
  }

  // Mifflin-St Jeor
  const bmr = sex === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;

  const tdee = bmr * activity;

  const goalMultipliers = {
    'cut-aggr': 0.75,
    'cut': 0.85,
    'maintain': 1.0,
    'bulk': 1.10,
    'bulk-aggr': 1.20,
  };
  const targetCalories = Math.round(tdee * goalMultipliers[goal]);

  // Macros
  const proteinG = Math.round(weight * proteinRatio);
  const proteinCal = proteinG * 4;
  // Grasa: 25% del total (mínimo 0.8 g/kg)
  const fatCal = Math.max(targetCalories * 0.25, weight * 0.8 * 9);
  const fatG = Math.round(fatCal / 9);
  // Carbos: el resto
  const carbsCal = targetCalories - proteinCal - fatG * 9;
  const carbsG = Math.max(0, Math.round(carbsCal / 4));

  state.pendingCalc = {
    body: { sex, age, weight, height, activity, goal, proteinRatio },
    goals: { calories: targetCalories, protein: proteinG, carbs: carbsG, fat: fatG },
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  };

  $('#calcBMR').textContent = `${Math.round(bmr)} kcal`;
  $('#calcTDEE').textContent = `${Math.round(tdee)} kcal`;
  $('#calcCal').textContent = `${targetCalories} kcal`;
  $('#calcProt').textContent = `${proteinG} g`;
  $('#calcCarbs').textContent = `${carbsG} g`;
  $('#calcFat').textContent = `${fatG} g`;
  $('#calcResult').classList.remove('hidden');
  $('#btnCalcApply').disabled = false;
}

function applyCalc(e) {
  e.preventDefault();
  if (!state.pendingCalc) return;
  state.settings.goals = state.pendingCalc.goals;
  state.settings.body = state.pendingCalc.body;
  save();
  // Reflejar en el form de settings si está abierto
  $('#setGoalCalories').value = state.settings.goals.calories;
  $('#setGoalProtein').value = state.settings.goals.protein;
  $('#setGoalCarbs').value = state.settings.goals.carbs;
  $('#setGoalFat').value = state.settings.goals.fat;
  closeModal($('#modalCalc'));
  renderToday();
  toast('Objetivos calculados aplicados', 'success');
}

/* ---------- Recordatorios y notificaciones ---------- */
async function requestNotificationPermission() {
  // Capacitor LocalNotifications
  if (window.Capacitor?.Plugins?.LocalNotifications) {
    try {
      const res = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      updateNotifStatus(res.display === 'granted' ? 'granted' : 'denied');
      return res.display === 'granted';
    } catch (e) {
      updateNotifStatus('denied');
      return false;
    }
  }
  // Web
  if (!('Notification' in window)) {
    updateNotifStatus('unsupported');
    return false;
  }
  const result = await Notification.requestPermission();
  updateNotifStatus(result);
  return result === 'granted';
}

function updateNotifStatus(state) {
  const el = $('#notifStatus');
  const map = {
    granted: '✓ Permiso concedido',
    denied: '✗ Permiso denegado — habilítalo en ajustes del navegador',
    default: 'Pendiente de solicitar permiso',
    unsupported: 'Tu navegador no soporta notificaciones',
  };
  el.textContent = map[state] || '';
}

function scheduleReminder() {
  // Limpiar timer previo (web)
  if (state.reminderTimer) {
    clearTimeout(state.reminderTimer);
    state.reminderTimer = null;
  }

  const r = state.settings.reminders;
  if (!r.enabled) {
    cancelCapacitorReminder();
    return;
  }

  // Capacitor: programar notificación nativa diaria
  if (window.Capacitor?.Plugins?.LocalNotifications) {
    scheduleCapacitorReminder();
    return;
  }

  // Web fallback: setTimeout mientras la app esté abierta
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const [h, m] = r.time.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;

  state.reminderTimer = setTimeout(() => {
    // Mostrar solo si no se ha registrado nada hoy
    const entries = state.log[todayKey()] || [];
    if (entries.length === 0) {
      try {
        new Notification('Contador de Calorías', {
          body: '¿Ya registraste lo que comiste hoy?',
          icon: 'icon.svg',
          tag: 'cal-reminder',
        });
      } catch (e) {}
    }
    scheduleReminder(); // Re-programar para mañana
  }, delay);
}

async function scheduleCapacitorReminder() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LN) return;
  const [h, m] = state.settings.reminders.time.split(':').map(Number);
  try {
    await LN.cancel({ notifications: [{ id: 1 }] });
    await LN.schedule({
      notifications: [{
        id: 1,
        title: 'Contador de Calorías',
        body: '¿Ya registraste lo que comiste hoy?',
        schedule: { every: 'day', on: { hour: h, minute: m }, allowWhileIdle: true },
      }],
    });
  } catch (e) { console.warn('Capacitor schedule error', e); }
}

async function cancelCapacitorReminder() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LN) return;
  try { await LN.cancel({ notifications: [{ id: 1 }] }); } catch (e) {}
}

function checkInAppReminder() {
  const banner = $('#reminderBanner');
  banner.classList.add('hidden');
  const r = state.settings.reminders;
  if (!r.enabled) return;
  if (r.dismissedDate === todayKey()) return;
  const [h, m] = r.time.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (now < target) return;
  const entries = state.log[todayKey()] || [];
  if (entries.length === 0) banner.classList.remove('hidden');
}

function dismissReminder() {
  state.settings.reminders.dismissedDate = todayKey();
  save();
  $('#reminderBanner').classList.add('hidden');
}

/* ---------- Bindings ---------- */
function setupEvents() {
  // Header
  $('#btnSettings').addEventListener('click', openSettings);

  // Today: add buttons
  $$('.add-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => openLogModal(btn.dataset.meal));
  });

  // Foods tab
  $('#btnNewFood').addEventListener('click', () => openFoodModal());
  $('#btnScan').addEventListener('click', () => openScanModal('register'));
  $('#btnScanInModal').addEventListener('click', () => openScanModal('register'));
  $('#btnScanInLog').addEventListener('click', () => openScanModal('log', state.currentMeal));
  $('#btnSearchOFF').addEventListener('click', openOffSearchModal);
  $('#btnOffSearchGo').addEventListener('click', runOffSearch);
  $('#offSearchQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runOffSearch(); }
  });
  $('#btnLookupManual').addEventListener('click', lookupManualBarcode);
  $('#manualBarcode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); lookupManualBarcode(); }
  });
  $('#searchFoods').addEventListener('input', (e) => renderFoods(e.target.value));

  // Modal close buttons
  $$('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal.id === 'modalScan') closeScanModal();
      else modal.classList.add('hidden');
    });
  });

  // Click outside modal closes it
  $$('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal.id === 'modalScan') closeScanModal();
        else modal.classList.add('hidden');
      }
    });
  });

  // Food form
  $('#formFood').addEventListener('submit', handleFoodSubmit);
  $('#btnDeleteFood').addEventListener('click', handleDeleteFood);
  $('#foodPhoto').addEventListener('change', handlePhotoChange);
  $('#btnAI').addEventListener('click', handleAIClick);

  // Log search
  $('#logSearch').addEventListener('input', (e) => renderLogFoodsList(e.target.value));

  // Amount form
  $('#formAmount').addEventListener('submit', handleAmountSubmit);
  $('#amountValue').addEventListener('input', updateAmountPreview);
  $$('.qmult').forEach(b => {
    b.addEventListener('click', () => {
      const food = state.selectedFood;
      if (!food) return;
      $('#amountValue').value = round(food.portion * parseFloat(b.dataset.mult));
      updateAmountPreview();
    });
  });

  // Settings
  $('#formSettings').addEventListener('submit', handleSettingsSubmit);
  $('#btnExport').addEventListener('click', exportData);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });
  $('#btnReset').addEventListener('click', resetData);
  $('#btnRequestNotif').addEventListener('click', requestNotificationPermission);

  // Calculadora
  $('#btnOpenCalc').addEventListener('click', openCalcModal);
  $('#btnCalcCompute').addEventListener('click', computeCalc);
  $('#formCalc').addEventListener('submit', applyCalc);
  // Recalcular en vivo cuando cambian valores
  ['calcSex', 'calcAge', 'calcWeight', 'calcHeight', 'calcActivity', 'calcGoal', 'calcProteinRatio'].forEach(id => {
    $(`#${id}`).addEventListener('change', () => {
      if (state.pendingCalc) computeCalc();
    });
  });

  // Recordatorio in-app
  $('#btnDismissReminder').addEventListener('click', dismissReminder);
}

/* ---------- Service Worker (PWA) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // No registrar SW cuando se abre por file:// (no soportado) ni dentro de Capacitor (app nativa)
  if (location.protocol === 'file:') return;
  if (window.Capacitor) return;
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

/* ---------- Init ---------- */
function bootApp() {
  load();
  $('#todayDate').textContent = formatDate(new Date());
  setupTabs();
  setupEvents();
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', logout);
  renderToday();
  renderFoods();
  registerSW();
  scheduleReminder();
  checkInAppReminder();

  // Re-chequear el banner cuando vuelve la pestaña (el usuario pudo dejar la app abierta)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkInAppReminder();
  });

  // Atajo desde el manifest (?action=scan)
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'scan') {
    setTimeout(() => openScanModal('register'), 400);
  }
}

function init() {
  setupLogin(bootApp);
  const auth = loadAuth();
  if (auth?.user) {
    hideLogin();
    bootApp();
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
