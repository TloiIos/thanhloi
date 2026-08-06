/* ============================================
   GET KEY — Application Logic
   ============================================ */

const CONFIG = {
    keysUrl: 'https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys.json',
    pkgsUrl: 'https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/packages.json',
    deviceKey: 'com.myModApp.uniqueDeviceID',
    durationMs: 24 * 60 * 60 * 1000
};

const state = {
    packages: {},
    lockedPackageId: null,   // package được khoá cứng (Thành Lợi)
    lockedPackageName: null,
    deviceId: null,
    timer: null
};

const TARGET_PACKAGE = 'Thành Lợi';   // package duy nhất được phép cấp key

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const uuid = () => (crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
        return v.toString(16);
    }));

const getDevice = () => {
    if (state.deviceId) return state.deviceId;
    let id = localStorage.getItem(CONFIG.deviceKey);
    if (!id) { id = uuid(); localStorage.setItem(CONFIG.deviceKey, id); }
    state.deviceId = id;
    return id;
};

const fmt = (ms) => {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms/1000);
    return [s/3600|0, (s%3600)/60|0, s%60]
        .map(n => String(n).padStart(2,'0')).join(':');
};

const keyId = () => {
    const p = () => Math.random().toString(36).slice(2,6).toUpperCase();
    return `${p()}-${p()}${p()}-${p()}${p()}-${p()}${p()}`;
};

const fetchJson = async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(r.status);
    return r.json();
};

// ---------- UI ----------
const loading = (on) => $('loader').classList.toggle('is-on', on);

const toast = (msg, kind = 'ok') => {
    const t = $('toast');
    $('toastText').textContent = msg;
    t.className = `toast is-on is-${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('is-on'), 2600);
};

const copy = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
};

// ---------- Packages ----------
async function loadPackages() {
    try {
        const data = await fetchJson(CONFIG.pkgsUrl);
        state.packages = data || {};
        lockTargetPackage();
    } catch {
        $('pkgName').textContent = 'Không thể tải package';
        $('ctaText').textContent = 'Thử lại sau';
        toast('Mất kết nối tới server', 'no');
    }
}

function lockTargetPackage() {
    // Tìm package có name == "Thành Lợi"
    const found = Object.entries(state.packages).find(
        ([, p]) => (p.name || '').trim().toLowerCase() === TARGET_PACKAGE.toLowerCase()
    );

    if (!found) {
        $('pkgName').textContent = 'Package không tồn tại';
        $('ctaText').textContent = 'Liên hệ admin';
        return;
    }

    const [id, p] = found;
    state.lockedPackageId = id;
    state.lockedPackageName = p.name;

    // Render banner
    $('pkgName').textContent = p.name;
    if (p.description) {
        // optional: ghi đè hint nếu cần
    }
    enableCta(p.status === 'active');
}

function enableCta(on) {
    $('cta').disabled = !on;
    if (!on) {
        $('ctaText').textContent = state.lockedPackageId
            ? 'Package đang tắt'
            : 'Đang tải package...';
    } else {
        $('ctaText').textContent = 'Lấy key ngay';
    }
}

// ---------- Keys ----------
async function findActiveKey() {
    const dev = getDevice();
    const all = await fetchJson(CONFIG.keysUrl);
    if (!all) return null;
    const now = Date.now();
    for (const [id, k] of Object.entries(all)) {
        if (k.status !== 'active') continue;
        if (k.expiresAt <= now) continue;
        if (k.devices?.[dev] === true) return { id, ...k };
    }
    return null;
}

async function getKey() {
    if (!state.lockedPackageId) return;
    loading(true);
    try {
        const active = await findActiveKey();
        if (active) {
            loading(false);
            renderResult(active, 'exists');
            toast('Bạn đã có key đang hoạt động', 'ok');
            return;
        }

        // Cooldown 24h
        const all = (await fetchJson(CONFIG.keysUrl)) || {};
        const dev = getDevice();
        const now = Date.now();
        let last = 0;
        for (const k of Object.values(all)) {
            if (k.devices?.[dev] === true && (k.createdAt || 0) > last) {
                last = k.createdAt;
            }
        }
        if (last && (now - last) < CONFIG.durationMs) {
            loading(false);
            renderCooldown(CONFIG.durationMs - (now - last));
            toast('Đang trong thời gian chờ 24h', 'no');
            return;
        }

        // New key — luôn gắn vào package Thành Lợi
        const id = keyId();
        const data = {
            createdAt: now,
            devices: { [dev]: true },
            expiresAt: now + CONFIG.durationMs,
            maxDevices: 1,
            packageId: state.lockedPackageId,
            status: 'active'
        };
        await fetch(`${CONFIG.keysUrl.replace('.json','')}/${id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        renderResult({ id, ...data }, 'new');
        toast('Tạo key thành công', 'ok');
    } catch (e) {
        console.error(e);
        toast('Có lỗi xảy ra, thử lại', 'no');
    } finally {
        loading(false);
    }
}

// ---------- Render ----------
function iconFor(kind) {
    return {
        new:  ['is-ok',   '<polyline points="20 6 9 17 4 12"/>'],
        exists:['is-info', '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'],
        cooldown:['is-warn','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>']
    }[kind] || ['is-info', ''];
}

function renderResult(key, kind) {
    const pkg = state.packages[key.packageId];
    const pkgName = pkg?.name || 'Unknown';
    const rem = key.expiresAt - Date.now();
    const [cls, svg] = iconFor(kind);
    const head = kind === 'new'
        ? ['Key activated', 'Đã cấp quyền thành công — sử dụng ngay.']
        : ['Key còn hiệu lực', 'Mỗi thiết bị chỉ được giữ 1 key tại 1 thời điểm.'];

    $('result').innerHTML = `
        <div class="result-head">
            <div class="result-ico ${cls}">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>
            </div>
            <div class="result-titles">
                <h4>${esc(head[0])}</h4>
                <p>${esc(head[1])}</p>
            </div>
        </div>

        <div class="keybox">
            <div class="keybox-label">License key</div>
            <div class="keybox-value" id="keyVal">${esc(key.id)}</div>
            <div class="keybox-actions">
                <button class="btn-mini is-fill" id="cpKey">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy key
                </button>
                <button class="btn-mini" id="openFirebase">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    View in DB
                </button>
            </div>
        </div>

        <div class="infos">
            <div class="info">
                <div class="info-label">Package</div>
                <div class="info-val">${esc(pkgName)}</div>
            </div>
            <div class="info">
                <div class="info-label">Expires in</div>
                <div class="info-val is-warn"><span id="cd">${fmt(rem)}</span></div>
            </div>
            <div class="info">
                <div class="info-label">Device</div>
                <div class="info-val">1 / 1</div>
            </div>
            <div class="info">
                <div class="info-label">Status</div>
                <div class="info-val is-ok">● Active</div>
            </div>
        </div>
    `;
    $('result').classList.add('is-on');
    $('cpKey').addEventListener('click', () => copy(key.id).then(() => toast('Đã sao chép key', 'ok')));
    $('openFirebase').addEventListener('click', () => window.open(
        `https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys/${key.id}.json`,
        '_blank'
    ));
    startCountdown(key.expiresAt);
}

function renderCooldown(ms) {
    $('result').innerHTML = `
        <div class="result-head">
            <div class="result-ico is-warn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
            </div>
            <div class="result-titles">
                <h4>Trong thời gian chờ</h4>
                <p>Mỗi thiết bị chỉ được cấp key 1 lần / 24 giờ.</p>
            </div>
        </div>
        <div class="infos">
            <div class="info" style="grid-column: 1 / -1;">
                <div class="info-label">Cooldown còn lại</div>
                <div class="info-val is-warn"><span id="cd">${fmt(ms)}</span></div>
            </div>
        </div>
    `;
    $('result').classList.add('is-on');
    cooldownTimer(ms);
}

function startCountdown(expiresAt) {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
        const el = $('cd');
        if (!el) return clearInterval(state.timer);
        const r = expiresAt - Date.now();
        el.textContent = fmt(r);
        if (r <= 0) { clearInterval(state.timer); el.textContent = 'Expired'; }
    }, 1000);
}

function cooldownTimer(start) {
    clearInterval(state.timer);
    let r = start;
    state.timer = setInterval(() => {
        const el = $('cd');
        if (!el) return clearInterval(state.timer);
        r -= 1000;
        if (r <= 0) {
            clearInterval(state.timer);
            el.textContent = 'Sẵn sàng';
            enableCta(!!state.lockedPackageId);
        } else {
            el.textContent = fmt(r);
        }
    }, 1000);
}

// ---------- Init ----------
function init() {
    $('deviceIdDisplay').textContent = getDevice();
    $('copyDeviceBtn').addEventListener('click', () => copy(getDevice()).then(() => toast('Đã sao chép UID', 'ok')));
    $('cta').addEventListener('click', getKey);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !$('cta').disabled) getKey();
    });
    loadPackages();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}