/* ============================================
   ADMIN CONSOLE — Thành Lợi
   Login + Dashboard for managing the key limit
   ============================================ */

const CONFIG = {
    keysUrl: 'https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys.json',
    pkgsUrl: 'https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/packages.json',
    base:    'https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app'
};
const MAX_KEYS = 10;
const ADMIN_PW = 'THANHLOI';        // đổi tại đây nếu muốn
const SESSION_KEY = 'getkey_admin_ok';

const TARGET_PACKAGE = 'Thành Lợi';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

const fetchJson = async (url, opts) => {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(r.status);
    return r.json();
};

const loading = (on) => $('loader').classList.toggle('is-on', on);

const toast = (msg, kind = 'ok') => {
    const t = $('toast');
    $('toastText').textContent = msg;
    t.className = `toast is-on is-${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('is-on'), 2600);
};

// ---------- Modal ----------
const modal = {
    _onConfirm: null,
    open(title, desc, onConfirm) {
        $('modalTitle').textContent = title;
        $('modalDesc').textContent = desc;
        this._onConfirm = onConfirm;
        $('modal').hidden = false;
    },
    close() {
        $('modal').hidden = true;
        this._onConfirm = null;
    }
};

// ---------- Login ----------
function initLogin() {
    const pwInput = $('pwInput');
    const pwToggle = $('pwToggle');
    const form = $('loginForm');
    const err = $('loginError');

    pwToggle.addEventListener('click', () => {
        pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const pw = pwInput.value;
        if (pw !== ADMIN_PW) {
            err.textContent = 'Sai mật khẩu';
            pwInput.classList.add('is-wrong');
            setTimeout(() => pwInput.classList.remove('is-wrong'), 400);
            return;
        }
        sessionStorage.setItem(SESSION_KEY, '1');
        showDashboard();
    });

    if (sessionStorage.getItem(SESSION_KEY) === '1') {
        showDashboard();
    }
}

function showDashboard() {
    $('loginView').hidden = true;
    $('dashView').hidden = false;
    initDashboard();
}

// ---------- Dashboard ----------
const state = {
    packages: {},
    lockedPackageId: null,
    lockedPackageName: null,
    keys: {}            // map id -> key object
};

function findPackage() {
    return Object.entries(state.packages).find(
        ([, p]) => (p.name || '').trim().toLowerCase() === TARGET_PACKAGE.toLowerCase()
    );
}

async function loadAll() {
    loading(true);
    try {
        const [pkgs, keys] = await Promise.all([
            fetchJson(CONFIG.pkgsUrl),
            fetchJson(CONFIG.keysUrl)
        ]);
        state.packages = pkgs || {};
        state.keys = keys || {};
        const found = findPackage();
        if (found) {
            state.lockedPackageId = found[0];
            state.lockedPackageName = found[1].name;
        }
        render();
    } catch (e) {
        toast('Không tải được dữ liệu', 'no');
    } finally {
        loading(false);
    }
}

function getTargetKeys() {
    if (!state.lockedPackageId) return [];
    return Object.entries(state.keys)
        .filter(([, k]) => k.packageId === state.lockedPackageId)
        .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
}

function render() {
    const list = getTargetKeys();
    const issued = list.length;
    const remain = Math.max(0, MAX_KEYS - issued);
    const isLocked = issued >= MAX_KEYS;

    $('dashIssued').textContent = issued;
    $('dashRemain').textContent = remain;
    $('dashBar').style.width = `${Math.min(100, (issued / MAX_KEYS) * 100)}%`;
    $('dashBar').classList.toggle('is-full', isLocked);

    const statusEl = $('dashStatus');
    const subEl = $('dashStatusSub');
    if (isLocked) {
        statusEl.innerHTML = `<span class="dash-status-dot dash-status-no"></span><span>Đã đóng</span>`;
        statusEl.className = 'dash-stat-val is-no';
        subEl.textContent = `Đã cấp đủ ${MAX_KEYS}/${MAX_KEYS}`;
    } else {
        statusEl.innerHTML = `<span class="dash-status-dot dash-status-ok"></span><span>Đang mở</span>`;
        statusEl.className = 'dash-stat-val is-ok';
        subEl.textContent = `Có thể cấp ${remain} key nữa`;
    }

    // Table
    const table = $('keyTable');
    if (!list.length) {
        table.innerHTML = `<div class="key-table-empty">Chưa cấp key nào</div>`;
        return;
    }

    const now = Date.now();
    table.innerHTML = list.map(([id, k]) => {
        const expired = (k.expiresAt || 0) <= now;
        const devs = k.devices ? Object.keys(k.devices).length : 0;
        const status = k.status === 'active' && !expired
            ? '<span class="kt-status is-ok">● Active</span>'
            : '<span class="kt-status is-no">● Expired</span>';
        const created = new Date(k.createdAt || 0).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="kt-row">
                <div class="kt-key" title="${esc(id)}">${esc(id)}</div>
                <div class="kt-meta">
                    <span class="kt-devs">${devs} thiết bị</span>
                    <span class="kt-time">${created}</span>
                </div>
                <div class="kt-status-wrap">${status}</div>
                <button class="kt-del" data-id="${esc(id)}" title="Xoá key này">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    table.querySelectorAll('.kt-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            modal.open(
                'Xoá key này?',
                `Key ${id} sẽ bị xoá khỏi Firebase. Không thể hoàn tác.`,
                () => deleteKey(id)
            );
        });
    });
}

// ---------- Actions ----------
async function deleteKey(id) {
    loading(true);
    try {
        await fetch(`${CONFIG.base}/keys/${id}.json`, { method: 'DELETE' });
        delete state.keys[id];
        render();
        toast('Đã xoá key', 'ok');
    } catch (e) {
        toast('Xoá thất bại', 'no');
    } finally {
        loading(false);
    }
}

async function resetAll() {
    const list = getTargetKeys();
    if (!list.length) { toast('Chưa có key nào để xoá', 'no'); return; }
    loading(true);
    try {
        await Promise.all(list.map(([id]) =>
            fetch(`${CONFIG.base}/keys/${id}.json`, { method: 'DELETE' })
        ));
        list.forEach(([id]) => delete state.keys[id]);
        render();
        toast(`Đã reset — xoá ${list.length} key, web mở lại`, 'ok');
    } catch (e) {
        toast('Reset thất bại', 'no');
    } finally {
        loading(false);
    }
}

// ---------- Init ----------
function initDashboard() {
    $('modalCancel').addEventListener('click', () => modal.close());
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') modal.close(); });

    $('resetAllBtn').addEventListener('click', () => {
        const list = getTargetKeys();
        modal.open(
            'Reset toàn bộ?',
            `Sẽ xoá ${list.length} key của "${state.lockedPackageName}" khỏi Firebase. Web sẽ mở lại từ 0/${MAX_KEYS}. Không thể hoàn tác.`,
            resetAll
        );
    });

    $('reloadBtn').addEventListener('click', loadAll);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('modal').hidden) modal.close();
    });

    loadAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogin);
} else {
    initLogin();
}