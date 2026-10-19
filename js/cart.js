/* ============================================
   Ahluwalia Farm — shared product list + cart basket
   Orders are sent as a prefilled WhatsApp message.
   ============================================ */
export const WHATSAPP = '917986839571';

export const HONEY = {
  'multiflora':      { name: 'Multiflora Honey',      region: 'Himachal Pradesh & Punjab', prices: { '250g': 399, '500g': 699, '1kg': 1249 } },
  'mustard':         { name: 'Mustard Honey',         region: 'Hanumangarh, Rajasthan',   prices: { '250g': 399, '500g': 699, '1kg': 1249 } },
  'jamun':           { name: 'Jamun Honey',           region: 'Jamun blossoms',           prices: { '250g': 499, '500g': 899, '1kg': 1649 } },
  'ajwain':          { name: 'Ajwain Honey',          region: 'Ajwain blossoms',          prices: { '250g': 499, '500g': 899, '1kg': 1649 } },
  'kashmiri-acacia': { name: 'Kashmiri Acacia Honey', region: 'Kashmir',                  prices: { '250g': 699, '500g': 1199, '1kg': 2199 } },
};
export const EGGS = {
  '12': { name: 'Cage-Free Brown Eggs — 12 Pack', price: 239 },
  '25': { name: 'Cage-Free Brown Eggs — 25 Pack', price: 449 },
  '30': { name: 'Cage-Free Brown Eggs — 30 Pack', price: 499 },
};

const KEY = 'af-cart-v1';
const inr = (n) => '₹' + n.toLocaleString('en-IN');
export { inr };

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return memCart; } }
function save(c) { memCart = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) { /* private mode */ } render(); }
let memCart = [];

export function addToCart(item) {
  const c = load();
  const ex = c.find((x) => x.id === item.id);
  if (ex) ex.qty += 1; else c.push({ ...item, qty: 1 });
  save(c);
  bump();
}

// ---------- UI (injected once on every page) ----------
const css = `
.cart-fab{position:fixed;right:18px;bottom:18px;z-index:60;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;
  background:var(--forest-green,#2E5E3B);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);display:grid;place-items:center;transition:transform .2s}
.cart-fab svg{width:26px;height:26px}
.cart-fab.bump{transform:scale(1.15)}
.cart-fab__n{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:11px;background:var(--honey-gold,#D4A017);
  color:#1d1608;font:700 12px/22px Inter,system-ui,sans-serif;text-align:center;padding:0 6px}
.cart-fab__n[hidden]{display:none}
.cart-panel{position:fixed;inset:0;z-index:70;display:none}
.cart-panel.open{display:block}
.cart-panel__bg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.cart-panel__box{position:absolute;right:0;top:0;bottom:0;width:min(420px,100%);background:#faf8f2;color:#2b2b2b;display:flex;flex-direction:column;
  box-shadow:-10px 0 30px rgba(0,0,0,.2);font-family:Inter,system-ui,sans-serif}
.cart-panel__head{display:flex;justify-content:space-between;align-items:center;padding:20px 22px;border-bottom:1px solid #e7e1d2}
.cart-panel__head h3{font-family:var(--font-serif,Georgia,serif);font-size:1.4rem;margin:0;color:var(--forest-green,#2E5E3B)}
.cart-x{border:0;background:none;font-size:28px;line-height:1;cursor:pointer;color:#555}
.cart-list{flex:1;overflow:auto;padding:8px 22px;list-style:none;margin:0}
.cart-li{display:grid;grid-template-columns:1fr auto;gap:6px 12px;padding:14px 0;border-bottom:1px solid #eee6d4}
.cart-li__name{font-weight:600}
.cart-li__sub{font-size:.85rem;color:#7a7060}
.cart-qty{display:flex;align-items:center;gap:8px}
.cart-qty button{width:28px;height:28px;border-radius:50%;border:1px solid #d9cfb8;background:#fff;cursor:pointer;font-size:16px}
.cart-li__price{font-weight:600;text-align:right;align-self:center}
.cart-empty{padding:40px 0;text-align:center;color:#8a8070}
.cart-foot{padding:18px 22px;border-top:1px solid #e7e1d2}
.cart-total{display:flex;justify-content:space-between;font-size:1.15rem;font-weight:700;margin-bottom:14px}
.cart-wa{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;border:0;border-radius:999px;cursor:pointer;
  background:#25D366;color:#fff;font:600 1rem Inter,system-ui,sans-serif}
.cart-wa[disabled]{opacity:.5;cursor:not-allowed}
.cart-note{font-size:.78rem;color:#8a8070;text-align:center;margin-top:10px}
.cart-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:80;background:#2b2b2b;color:#fff;
  padding:10px 18px;border-radius:999px;font:500 .9rem Inter,system-ui,sans-serif;transition:all .25s;pointer-events:none}
.cart-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
`;
let fab, count, panel, list, totalEl, waBtn, toast;
function mount() {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  fab = document.createElement('button');
  fab.className = 'cart-fab'; fab.setAttribute('aria-label', 'Open cart');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg><span class="cart-fab__n" hidden>0</span>';
  count = fab.querySelector('.cart-fab__n');
  panel = document.createElement('div'); panel.className = 'cart-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Your cart');
  panel.innerHTML = `<div class="cart-panel__bg"></div><div class="cart-panel__box">
    <div class="cart-panel__head"><h3>Your Basket</h3><button class="cart-x" aria-label="Close">×</button></div>
    <ul class="cart-list"></ul>
    <div class="cart-foot"><div class="cart-total"><span>Total</span><span class="cart-total__v">₹0</span></div>
      <button class="cart-wa"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4.9 2.9.7 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>Order on WhatsApp</button>
      <p class="cart-note">We'll confirm availability and delivery on WhatsApp.</p></div></div>`;
  list = panel.querySelector('.cart-list'); totalEl = panel.querySelector('.cart-total__v'); waBtn = panel.querySelector('.cart-wa');
  toast = document.createElement('div'); toast.className = 'cart-toast';
  document.body.append(fab, panel, toast);
  fab.addEventListener('click', () => panel.classList.add('open'));
  panel.querySelector('.cart-x').addEventListener('click', () => panel.classList.remove('open'));
  panel.querySelector('.cart-panel__bg').addEventListener('click', () => panel.classList.remove('open'));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    const c = load(); const it = c.find((x) => x.id === b.dataset.id); if (!it) return;
    it.qty += +b.dataset.d; save(c.filter((x) => x.qty > 0));
  });
  waBtn.addEventListener('click', () => {
    const c = load(); if (!c.length) return;
    const lines = c.map((x) => `• ${x.name}${x.size ? ' (' + x.size + ')' : ''} × ${x.qty} = ${inr(x.price * x.qty)}`);
    const total = c.reduce((s, x) => s + x.price * x.qty, 0);
    const msg = `Hello Ahluwalia Farm! I'd like to order:\n${lines.join('\n')}\n\nTotal: ${inr(total)}\n\nName:\nDelivery address:`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  });
  render();
}
function render() {
  if (!list) return;
  const c = load();
  const n = c.reduce((s, x) => s + x.qty, 0);
  count.textContent = n; count.hidden = !n;
  list.innerHTML = c.length ? c.map((x) => `<li class="cart-li">
      <div><div class="cart-li__name">${x.name}</div><div class="cart-li__sub">${x.size ? x.size + ' · ' : ''}${inr(x.price)} each</div></div>
      <div class="cart-li__price">${inr(x.price * x.qty)}</div>
      <div class="cart-qty"><button data-id="${x.id}" data-d="-1" aria-label="Less">−</button><span>${x.qty}</span><button data-id="${x.id}" data-d="1" aria-label="More">+</button></div>
    </li>`).join('') : '<li class="cart-empty">Your basket is empty.</li>';
  totalEl.textContent = inr(c.reduce((s, x) => s + x.price * x.qty, 0));
  waBtn.disabled = !c.length;
}
function bump() {
  fab.classList.add('bump'); setTimeout(() => fab.classList.remove('bump'), 220);
  toast.textContent = 'Added to basket'; toast.classList.add('show');
  clearTimeout(bump.t); bump.t = setTimeout(() => toast.classList.remove('show'), 1400);
}

mount();
// any button with data-add='{"id":..,"name":..,"size":..,"price":..}' adds to the cart
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  e.preventDefault();
  try { addToCart(JSON.parse(b.dataset.add)); } catch (_) { /* ignore */ }
});
