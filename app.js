// app.js (ระบบพนักงานขาย + พิมพ์ใบเสร็จ BLE + สแกน QR Code + จัดการตาราง Cafe_Amazon_Promosion_House)
const app = document.querySelector('#app');
let html5QrCode = null;
let bluetoothDevice = null;
let bluetoothCharacteristic = null;
let currentHouseDataList = [];
let adminSession = null;
let isProcessingScan = false;

const esc = val => String(val ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));

function maskPhoneNumber(phone) {
  if (!phone) return '-';
  const str = String(phone).trim();
  if (str.length <= 4) return 'xxxx';
  return str.slice(0, -4) + 'xxxx';
}

function showToast(msg) {
  const toast = document.querySelector('#toast') || createToastEl();
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

let installGuideShown = false;
const INSTALL_GUIDE_DISMISSED_KEY = 'staff-pwa-install-guide-dismissed';
function isInstalledPwa() {
  return Boolean(
    window.navigator.standalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    document.referrer.startsWith('android-app://')
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function showInstallGuide() {
  if (installGuideShown || isInstalledPwa() || localStorage.getItem(INSTALL_GUIDE_DISMISSED_KEY) === '1') return;
  const ios = isIosDevice();
  installGuideShown = true;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="pwa-install-guide" style="position:fixed; inset:0; z-index:30000; display:grid; place-items:center; padding:20px; background:rgba(20,40,29,.62);">
      <div style="width:min(100%,360px); padding:22px; border-radius:18px; background:#fffaf4; color:#2c241d; box-shadow:0 20px 45px rgba(0,0,0,.28); text-align:center;">
        <div style="font-size:36px;">📲</div>
        <h2 style="margin:6px 0; font-size:1.3rem; color:#194832;">ติดตั้งแอป</h2>
        <p style="margin:0 0 16px; color:#766b5e; line-height:1.55;">${ios ? 'แตะปุ่ม Share (□↑) ใน Safari แล้วเลือก “Add to Home Screen” เพื่อเพิ่มแอปลงหน้าจอหลัก' : 'ติดตั้ง D House x Café Amazon เพื่อเปิดใช้งานได้สะดวกยิ่งขึ้น'}</p>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button id="btn-dismiss-install-guide" type="button" style="padding:10px 14px; border-radius:10px; background:#e8efe4; color:#194832; font-weight:700;">ภายหลัง</button>
          ${ios ? '' : '<button id="btn-install-pwa" type="button" style="padding:10px 14px; border-radius:10px; background:#256b45; color:#fff; font-weight:700;">ติดตั้งแอป</button>'}
        </div>
      </div>
    </div>`);
  const guide = document.querySelector('#pwa-install-guide');
  document.querySelector('#btn-dismiss-install-guide').onclick = () => {
    localStorage.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1');
    guide.remove();
  };
  document.querySelector('#btn-install-pwa')?.addEventListener('click', async () => {
    const opened = await window.requestPwaInstall?.();
    if (!opened) showToast('โปรดติดตั้งจากเมนูเบราว์เซอร์');
    localStorage.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1');
    guide.remove();
  });
}

window.addEventListener('pwa-install-available', showInstallGuide);

function showInstalledPwaNotice() {
  document.querySelector('#pwa-install-guide')?.remove();
  localStorage.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1');
  document.querySelector('#pwa-installed-notice')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="pwa-installed-notice" style="position:fixed; inset:0; z-index:30001; display:grid; place-items:center; padding:20px; background:rgba(20,40,29,.62);">
      <section role="dialog" aria-modal="true" style="width:min(100%,360px); padding:22px; border-radius:18px; background:#fffaf4; color:#2c241d; box-shadow:0 20px 45px rgba(0,0,0,.28); text-align:center;">
        <div style="font-size:36px;">✅</div>
        <h2 style="margin:6px 0; font-size:1.3rem; color:#194832;">ติดตั้งแอปแล้ว</h2>
        <p style="margin:0 0 16px; color:#766b5e; line-height:1.55;">กรุณาปิดหน้าเว็บนี้ แล้วเปิดแอปจากไอคอนที่เพิ่งติดตั้งบนหน้าจอหลัก</p>
        <button id="btn-close-installed-notice" type="button" style="padding:10px 14px; border:0; border-radius:10px; background:#256b45; color:#fff; font-weight:700;">รับทราบ</button>
      </section>
    </div>`);
  document.querySelector('#btn-close-installed-notice').onclick = () => document.querySelector('#pwa-installed-notice')?.remove();
}

window.addEventListener('pwa-installed', showInstalledPwaNotice);

function createToastEl() {
  const el = document.createElement('div');
  el.id = 'toast';
  document.body.appendChild(el);
  return el;
}

// ===== ระบบเครื่องพิมพ์ Bluetooth (BLE) =====
const PRINT_WIDTH_DOTS = 384;
const PRINTER_SETTINGS_KEY = 'staff-selected-bluetooth-printer';
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getSavedPrinter() {
  try {
    const value = JSON.parse(localStorage.getItem(PRINTER_SETTINGS_KEY) || 'null');
    return value?.id ? value : null;
  } catch (e) {
    return null;
  }
}

function savePrinter(device) {
  localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify({
    id: device.id,
    name: device.name || 'Bluetooth Printer'
  }));
}

function clearSavedPrinter() {
  localStorage.removeItem(PRINTER_SETTINGS_KEY);
  forgetPrinter();
}

async function getConfiguredPrinterDevice() {
  const saved = getSavedPrinter();
  if (!saved) throw new Error('ยังไม่ได้ตั้งค่าเครื่องพิมพ์ กรุณาตั้งค่าจากหน้าจัดการสมาชิก');
  if (!navigator.bluetooth?.getDevices) {
    throw new Error('เบราว์เซอร์นี้ไม่สามารถตรวจสอบเครื่องพิมพ์ที่ตั้งค่าไว้ได้');
  }
  const devices = await navigator.bluetooth.getDevices();
  const device = devices.find(item => item.id === saved.id);
  if (!device) {
    throw new Error(`ไม่พบเครื่องพิมพ์ที่ตั้งไว้ (${saved.name}) กรุณาตั้งค่าเครื่องพิมพ์ใหม่`);
  }
  return device;
}

function forgetPrinter() {
  try { bluetoothDevice?.gatt?.disconnect(); } catch (e) {}
  bluetoothDevice = null;
  bluetoothCharacteristic = null;
}
window.forgetPrinter = forgetPrinter;

async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth');
  if (!window.isSecureContext) throw new Error('Web Bluetooth ต้องเปิดผ่าน HTTPS เท่านั้น');

  if (bluetoothCharacteristic && bluetoothDevice?.gatt?.connected) {
    return bluetoothCharacteristic;
  }

  if (!bluetoothDevice) {
    bluetoothDevice = await getConfiguredPrinterDevice();
    showToast(`กำลังตรวจสอบเครื่องพิมพ์: ${bluetoothDevice.name || 'Bluetooth Printer'}`);
  }

  bluetoothDevice.addEventListener('gattserverdisconnected', () => {
    bluetoothCharacteristic = null;
    showToast('เครื่องพิมพ์ Bluetooth ขาดการเชื่อมต่อ');
  });

  try {
    const server = await bluetoothDevice.gatt.connect();
    const services = await server.getPrimaryServices();
    if (services.length === 0) throw new Error('ไม่พบ service พิมพ์');

    for (const service of services) {
      const chars = await service.getCharacteristics();
      const writable = chars.find(c => c.properties.writeWithoutResponse || c.properties.write);
      if (writable) {
        bluetoothCharacteristic = writable;
        return writable;
      }
    }
    throw new Error('ไม่พบ characteristic ที่เขียนข้อมูลได้');
  } catch (err) {
    forgetPrinter();
    throw err;
  }
}

async function configureBluetoothPrinter() {
  if (!navigator.bluetooth) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth');
  if (!window.isSecureContext) throw new Error('Web Bluetooth ต้องเปิดผ่าน HTTPS เท่านั้น');

  forgetPrinter();
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES
  });
  bluetoothDevice = device;
  try {
    await connectBluetoothPrinter();
    savePrinter(device);
    showToast(`ตั้งค่าเครื่องพิมพ์ ${device.name || 'Bluetooth Printer'} เรียบร้อยแล้ว`);
  } catch (error) {
    forgetPrinter();
    throw new Error(`เชื่อมต่อเครื่องพิมพ์ไม่ได้: ${error.message}`);
  }
}

function openPrinterSettings() {
  const saved = getSavedPrinter();
  document.querySelector('#printer-settings-dialog')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="printer-settings-dialog" style="position:fixed; inset:0; z-index:20000; display:grid; place-items:center; padding:20px; background:rgba(15,23,42,.55);">
      <section role="dialog" aria-modal="true" aria-labelledby="printer-settings-title" style="width:min(100%,420px); padding:22px; border-radius:16px; background:#fff; color:#1e293b; box-shadow:0 18px 42px rgba(0,0,0,.25);">
        <h2 id="printer-settings-title" style="margin:0 0 10px; font-size:1.2rem; color:#0284c7;">🖨️ ตั้งค่าเครื่องพิมพ์</h2>
        <p style="margin:0 0 18px; line-height:1.55; color:#475569;">${saved ? `เครื่องที่เลือก: <strong>${esc(saved.name)}</strong>` : 'ยังไม่ได้เลือกเครื่องพิมพ์'}<br><small>ระบบจะตรวจสอบการเชื่อมต่อของเครื่องนี้ก่อนพิมพ์ทุกครั้ง</small></p>
        <div id="printer-settings-error" role="alert" style="display:none; margin:0 0 12px; color:#b91c1c;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
          ${saved ? '<button id="btn-clear-printer" type="button" style="padding:9px 12px; border:1px solid #fecaca; border-radius:8px; background:#fff; color:#b91c1c; font-weight:700;">ล้างการตั้งค่า</button>' : ''}
          <button id="btn-close-printer-settings" type="button" style="padding:9px 12px; border:0; border-radius:8px; background:#e2e8f0; color:#334155; font-weight:700;">ปิด</button>
          <button id="btn-select-printer" type="button" style="padding:9px 12px; border:0; border-radius:8px; background:#0284c7; color:#fff; font-weight:700;">${saved ? 'เปลี่ยนเครื่องพิมพ์' : 'เลือกเครื่องพิมพ์'}</button>
        </div>
      </section>
    </div>`);
  const dialog = document.querySelector('#printer-settings-dialog');
  const errorEl = document.querySelector('#printer-settings-error');
  document.querySelector('#btn-close-printer-settings').onclick = () => dialog.remove();
  document.querySelector('#btn-clear-printer')?.addEventListener('click', () => {
    clearSavedPrinter();
    dialog.remove();
    showToast('ล้างการตั้งค่าเครื่องพิมพ์แล้ว');
  });
  document.querySelector('#btn-select-printer').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    errorEl.style.display = 'none';
    try {
      await configureBluetoothPrinter();
      dialog.remove();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      button.disabled = false;
    }
  };
}

function makeWriter(ch) {
  if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) return d => ch.writeValueWithoutResponse(d);
  if (ch.properties.write && ch.writeValueWithResponse) return d => ch.writeValueWithResponse(d);
  return d => ch.writeValue(d);
}

async function sendBytes(ch, bytes) {
  const write = makeWriter(ch);
  let size = 60, i = 0;
  while (i < bytes.length) {
    try {
      await write(bytes.slice(i, i + size));
      i += size;
      await sleep(25);
    } catch (err) {
      if (size > 20) { size = 20; await sleep(100); continue; }
      throw err;
    }
  }
}

const THAI_COMBINING = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;

function formatCustomerName(name) {
  if (!name) return '-';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0]} xxxx`;
  }
  return name;
}

function createReceiptLines(data, billNo) {
  const now = new Date().toLocaleString('th-TH');
  const displayName = formatCustomerName(data.name);

  const buildBlock = (typeTitle) => [
    { text: 'D House x Café Amazon', align: 'center', bold: true },
    { text: `${typeTitle}`, align: 'center', bold: true },
    { text: `${now}` },
    { 
      leftText: `No. ${billNo}`, 
      rightText: `${data.address} ${data.project && data.project !== '-' ? data.project : ''}`.trim() 
    },
    { 
      leftText: `${displayName}`, 
      rightText: `${maskPhoneNumber(data.phone)}` 
    },
    { text: '1 สิทธิ์ (ใช้สิทธิ์ฟรี)' },
    { text: `${data.productName}`, bold: true },
    { text: `ใช้ไปแล้ว: ${data.usedCount + 1} สิทธิ์` },
    { text: `คงเหลือ: ${data.allLimit - (data.usedCount + 1)} สิทธิ์` },
    { text: '' },
    { text: 'ขอบคุณที่ใช้บริการ', align: 'center' }
  ];

  return {
    original: buildBlock(''),
    copy: buildBlock('(ร้านค้าเก็บ)')
  };
}

async function printReceiptESC_POS(characteristic, lines) {
  if (document.fonts) await document.fonts.ready;

  const width = PRINT_WIDTH_DOTS, FONT_PX = 24, LINE_H = 34, PAD = 4;
  const thaiFontStack = '"Noto Sans Thai", "Sarabun", "Tahoma", sans-serif';
  const fontOf = l => `${l.bold ? 'bold ' : ''}${FONT_PX}px ${thaiFontStack}`;

  const m = document.createElement('canvas').getContext('2d');
  const rows = [];

  for (const l of lines) {
    m.font = fontOf(l);

    if (l.leftText !== undefined || l.rightText !== undefined) {
      rows.push({
        isSplit: true,
        leftText: String(l.leftText ?? ''),
        rightText: String(l.rightText ?? ''),
        bold: l.bold
      });
    } else {
      let cur = '';
      for (const ch of String(l.text ?? '')) {
        const tooWide = m.measureText(cur + ch).width > width - PAD * 2;
        if (tooWide && !THAI_COMBINING.test(ch) && cur) { rows.push({ ...l, text: cur }); cur = ch; }
        else cur += ch;
      }
      rows.push({ ...l, text: cur });
    }
  }

  const height = (rows.length * LINE_H) + 20;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  let currentY = 10;

  ctx.fillStyle = '#000000'; ctx.textBaseline = 'middle';
  rows.forEach((r, i) => {
    ctx.font = fontOf(r);
    const yPos = currentY + i * LINE_H + LINE_H / 2;

    if (r.isSplit) {
      ctx.textAlign = 'left';
      ctx.fillText(r.leftText, PAD, yPos);

      ctx.textAlign = 'right';
      ctx.fillText(r.rightText, width - PAD, yPos);
    } else {
      ctx.textAlign = 'left';
      if (r.align === 'center') {
        const w = ctx.measureText(r.text).width;
        const x = Math.max(PAD, (width - w) / 2);
        ctx.fillText(r.text, x, yPos);
      } else {
        ctx.fillText(r.text, PAD, yPos);
      }
    }
  });

  const imgData = ctx.getImageData(0, 0, width, height).data;
  await sendBytes(characteristic, new Uint8Array([0x1B, 0x40, 0x1B, 0x33, 0x18]));
  await sleep(50);

  const n1 = width & 0xFF, n2 = (width >> 8) & 0xFF;
  for (let y = 0; y < height; y += 24) {
    const chunkHeader = new Uint8Array([0x1B, 0x2A, 33, n1, n2]);
    const lineBytes = new Uint8Array(width * 3);

    for (let x = 0; x < width; x++) {
      for (let b = 0; b < 24; b++) {
        const targetY = y + b;
        if (targetY < height) {
          const idx = (targetY * width + x) * 4;
          if (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2] < 140) {
            lineBytes[x * 3 + Math.floor(b / 8)] |= (0x80 >> (b % 8));
          }
        }
      }
    }

    const combined = new Uint8Array(chunkHeader.length + lineBytes.length + 1);
    combined.set(chunkHeader, 0);
    combined.set(lineBytes, chunkHeader.length);
    combined.set([0x0A], chunkHeader.length + lineBytes.length);
    await sendBytes(characteristic, combined);
  }

  await sendBytes(characteristic, new Uint8Array([0x1B, 0x32, 0x1B, 0x64, 0x05, 0x1D, 0x56, 0x42, 0x00]));
  await sleep(300);
}

async function runPrint(data, billNo) {
  const characteristic = await connectBluetoothPrinter();
  const receipts = createReceiptLines(data, billNo);

  await printReceiptESC_POS(characteristic, receipts.original);
  await printReceiptESC_POS(characteristic, receipts.copy);
}

async function printTestReceipt() {
  if (!getSavedPrinter()) {
    showToast('ยังไม่ได้ตั้งค่าเครื่องพิมพ์ กรุณาให้แอดมินตั้งค่าก่อน');
    return;
  }

  showPrintLoadingDialog('กำลังตรวจสอบและส่งใบเสร็จทดสอบ...');
  try {
    const characteristic = await connectBluetoothPrinter();
    const testData = {
      name: 'ทดสอบระบบ',
      phone: '-',
      address: 'TEST',
      project: '-',
      productName: 'ใบเสร็จทดสอบเครื่องพิมพ์',
      usedCount: 0,
      allLimit: 1
    };
    const receipt = createReceiptLines(testData, `TEST-${Date.now().toString().slice(-6)}`);
    await printReceiptESC_POS(characteristic, receipt.original);
    showToast('พิมพ์ใบเสร็จทดสอบเรียบร้อยแล้ว');
  } catch (error) {
    console.error('Test print failed:', error);
    showToast(`พิมพ์ทดสอบไม่ได้: ${error.message}`);
  } finally {
    removePrintLoadingDialog();
  }
}

// ===== ระบบสแกนกล้อง QR Code =====
async function startScanner() {
  const readerEl = document.querySelector('#reader');
  const btn = document.querySelector('#btn-toggle-camera');
  const manageButton = document.querySelector('#btn-manage-member');
  const testPrintButton = document.querySelector('#btn-test-print');
  const scannerStatus = document.querySelector('#scanner-status');
  if (!readerEl) return;

  isProcessingScan = false;
  readerEl.style.display = 'block';
  if (manageButton) manageButton.style.display = 'none';
  if (testPrintButton) testPrintButton.style.display = 'none';
  if (scannerStatus) scannerStatus.textContent = 'เล็ง QR Code ให้อยู่ในกรอบ กล้องจะอ่านให้อัตโนมัติ';
  if (btn) {
    btn.textContent = '❌ ปิดกล้องสแกน';
    btn.style.background = '#dc2626';
  }

  if (!html5QrCode) {
    const scannerOptions = window.Html5QrcodeSupportedFormats?.QR_CODE
      ? { formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE] }
      : undefined;
    html5QrCode = new Html5Qrcode('reader', scannerOptions);
  }

  // ไม่จำกัดกรอบสแกน เพื่อให้อ่านได้ทันทีแม้ QR ไม่อยู่กึ่งกลางกล้อง
  const config = { fps: 10, disableFlip: false };

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      async (decodedText) => {
        if (isProcessingScan) return;
        isProcessingScan = true;
        showToast('สแกนสำเร็จ!');
        if (scannerStatus) scannerStatus.textContent = 'อ่าน QR สำเร็จ กำลังค้นหาข้อมูล...';
        await stopScanner();
        
        const scanPayload = parseScanPayload(decodedText);
        await processPhoneQuery(scanPayload.searchKey, scanPayload.productId);
      },
      () => {}
    );
  } catch (err) {
    console.error('Camera Error:', err);
    showToast('ไม่สามารถเปิดกล้องได้: ' + err.message);
    if (scannerStatus) scannerStatus.textContent = 'ไม่สามารถเปิดกล้องได้';
    stopScanner();
  }
}

function parseScanPayload(rawText) {
  if (!rawText) return { searchKey: '', productId: null };
  const str = String(rawText).trim();

  // QR ของ PWA Client เป็น JSON: couponId, productId, address, phone, expiresAt
  try {
    const payload = JSON.parse(str);
    const searchKey = payload.couponId || payload.Coupon_No || payload.phone || payload.Phone_No;
    if (searchKey) {
      return { searchKey: String(searchKey).trim(), productId: payload.productId ?? payload.Product_ID ?? null };
    }
  } catch (e) {}

  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const url = new URL(str);
      const phoneParam = url.searchParams.get('phone') || url.searchParams.get('tel') || url.searchParams.get('code') || url.searchParams.get('key');
      if (phoneParam) return { searchKey: phoneParam.trim(), productId: null };
    }
  } catch (e) {}

  const phoneMatch = str.match(/0\d{8,9}/);
  if (phoneMatch) return { searchKey: phoneMatch[0], productId: null };

  const couponMatch = str.match(/CPN-[A-Za-z0-9-]+/i);
  if (couponMatch) return { searchKey: couponMatch[0].toUpperCase(), productId: null };

  return { searchKey: str, productId: null };
}

async function stopScanner() {
  const readerEl = document.querySelector('#reader');
  const btn = document.querySelector('#btn-toggle-camera');
  const manageButton = document.querySelector('#btn-manage-member');
  const testPrintButton = document.querySelector('#btn-test-print');
  const scannerStatus = document.querySelector('#scanner-status');

  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {}
  }

  if (readerEl) readerEl.style.display = 'none';
  if (manageButton) manageButton.style.display = 'flex';
  if (testPrintButton) testPrintButton.style.display = 'block';
  if (scannerStatus) scannerStatus.textContent = '';
  if (btn) {
    btn.textContent = '📷 เปิดกล้องสแกน QR Code';
    btn.style.background = '#059669';
  }
}

// ===== ฟังก์ชันควบคุม Loading Dialog รอพิมพ์ =====
function showPrintLoadingDialog(msg = 'กำลังพิมพ์ใบเสร็จ กรุณารอสักครู่...') {
  removePrintLoadingDialog();
  const dialogHtml = `
    <div id="print-loading-dialog" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:99999; color:#fff; pointer-events:all;">
      <div style="background:#fff; color:#1e293b; padding:2rem; border-radius:16px; text-align:center; max-width:320px; width:80%; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3);">
        <div class="spinner" style="border:4px solid #f3f3f3; border-top:4px solid #059669; border-radius:50%; width:48px; height:48px; animation:spin 1s linear infinite; margin:0 auto 1.25rem auto;"></div>
        <h3 id="print-dialog-msg" style="margin:0 0 0.5rem 0; font-size:1.1rem; color:#059669;">🖨️ กำลังดำเนินการ</h3>
        <p id="print-dialog-sub" style="margin:0; font-size:0.9rem; color:#64748b;">${esc(msg)}</p>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', dialogHtml);
}

function updatePrintLoadingMessage(msg) {
  const subEl = document.querySelector('#print-dialog-sub');
  if (subEl) subEl.textContent = msg;
}

function removePrintLoadingDialog() {
  document.querySelector('#print-loading-dialog')?.remove();
}

function applyScannedProductFallback(data, scannedProductId) {
  if (data.productId || !scannedProductId) return data;

  const products = {
    '1': { name: 'แบล็คคอฟฟี (เย็น)', image: 'public/assets/image/black-coffee.webp' },
    '2': { name: 'เอสเปรสโซ (เย็น)', image: 'public/assets/image/espresso.webp' },
    '3': { name: 'ชานม (เย็น)', image: 'public/assets/image/tea-with-milk.webp' }
  };
  const productId = String(scannedProductId);
  const product = products[productId];

  return {
    ...data,
    productId,
    productName: product?.name || `สินค้า รหัส ${productId}`,
    productImage: product?.image || null
  };
}

function supportsBluetoothPrinting() {
  return Boolean(navigator.bluetooth && window.isSecureContext);
}

function renderAirPrintReceipt(data, billNo) {
  const printedAt = new Date().toLocaleString('th-TH');
  const remainingBenefits = Math.max(0, data.allLimit - (data.usedCount + 1));
  const project = data.project && data.project !== '-' ? ` ${data.project}` : '';
  app.innerHTML = `
    <div class="staff-page airprint-page">
      <div class="staff-page-header">
        <button class="back" id="btn-close-airprint" type="button" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h3>ใบเสร็จรับสิทธิ์</h3>
      </div>
      <main id="airprint-receipt" class="airprint-receipt">
        <h1>D House x Café Amazon</h1>
        <p>ใบเสร็จรับสิทธิ์คูปอง</p>
        <hr>
        <p class="airprint-date">${esc(printedAt)}</p>
        <p class="airprint-row"><span>เลขที่บิล: ${esc(billNo)}</span><span>${esc(data.address)}${esc(project)}</span></p>
        <p class="airprint-row"><span>${esc(formatCustomerName(data.name))}</span><span>${esc(maskPhoneNumber(data.phone))}</span></p>
        <hr>
        <p>จำนวน: 1 สิทธิ์ (ใช้สิทธิ์ฟรี)</p>
        <p class="airprint-product">${esc(data.productName)}</p>
        <p>ใช้ไปแล้ว: ${data.usedCount + 1} สิทธิ์</p>
        <p>คงเหลือ: ${remainingBenefits} สิทธิ์</p>
        <hr>
        <p class="airprint-thanks">ขอบคุณที่ใช้บริการ</p>
      </main>
      <div class="airprint-actions">
        <p>เลือกเครื่องพิมพ์ AirPrint จากเมนูพิมพ์ของ iPhone/iPad</p>
        <button id="btn-airprint" class="primary" type="button">🖨️ พิมพ์ด้วย AirPrint</button>
        <button id="btn-finish-airprint" class="secondary" type="button">เสร็จสิ้น</button>
      </div>
    </div>`;

  document.querySelector('#btn-close-airprint').onclick = renderMainUI;
  document.querySelector('#btn-finish-airprint').onclick = renderMainUI;
  document.querySelector('#btn-airprint').onclick = () => window.print();
}

async function processPhoneQuery(phone, scannedProductId = null) {
  showPrintLoadingDialog('กำลังค้นหาข้อมูลสมาชิก...');

  try {
    const data = applyScannedProductFallback(
      await window.staffApi.checkCouponInfo(phone),
      scannedProductId
    );
    removePrintLoadingDialog();
    renderClientDetailPage(data);
  } catch (err) {
    removePrintLoadingDialog();
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ===== หน้าแสดงรายละเอียดสมาชิก (ขยายแสดงผลแบบ Full Screen) =====
function renderClientDetailPage(data) {
  const displayName = formatCustomerName(data.name);

  const hasCouponOrProduct = Boolean(
    data.productId && 
    data.productName && 
    data.productName !== 'ไม่ได้เลือกสินค้า' && 
    data.couponNo && 
    data.couponNo !== 'ไม่มีคูปองที่ใช้งานอยู่'
  );

  const imgUrl = data.productImage || data.imageUrl || data.product_image || '';

  const modalHtml = `
    <div id="client-detail-modal" class="staff-page">
      
      <div class="staff-page-header">
        <button class="back" id="btn-close-detail" type="button" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h3>ข้อมูลสมาชิก</h3>
      </div>

      <div style="max-width:500px; width:100%; margin:0 auto; padding:1.25rem; box-sizing:border-box;">
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:1.25rem; background:#fff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <h3 style="margin:0 0 0.75rem 0; color:#059669; border-bottom:2px solid #059669; padding-bottom:0.4rem;">👤 รายละเอียดข้อมูลสมาชิก</h3>
          
          <div style="display:flex; flex-direction:column; gap:0.4rem; font-size:0.95rem; color:#334155;">
            <p style="margin:0;"><strong>ชื่อ:</strong> ${esc(displayName)}</p>
            <p style="margin:0;"><strong>เบอร์โทร:</strong> ${esc(maskPhoneNumber(data.phone))}</p>
            <p style="margin:0;"><strong>บ้านเลขที่:</strong> ${esc(data.address)} ${data.project && data.project !== '-' ? esc(data.project) : ''}</p>
            <p style="margin:0;"><strong>คูปอง:</strong> <span style="color:#059669; font-weight:bold;">${esc(data.couponNo || '-')}</span></p>
            <p style="margin:0;"><strong>สินค้า:</strong> <span style="color:#0284c7; font-weight:bold;">${esc(data.productName)}</span></p>
          </div>

          ${
            imgUrl 
              ? `<div style="text-align:center; margin:1rem 0;">
                  <img src="${esc(imgUrl)}" alt="${esc(data.productName)}" style="max-width:100%; max-height:200px; object-fit:contain; border-radius:8px; border:1px solid #e2e8f0; padding:4px;" />
                </div>`
              : ''
          }

          <p style="margin:0.75rem 0 0.25rem 0; font-size:0.95rem; color:#334155;">
            <strong>สิทธิ์ที่ใช้ไป:</strong> <span style="color:#d97706; font-weight:bold;">${data.usedCount}</span> / ${data.allLimit} ครั้ง
          </p>
          
          <div style="margin-top:1.25rem; display:flex; flex-direction:column; gap:0.6rem;">
            ${
              hasCouponOrProduct
                ? `<button id="btn-confirm-redeem" style="width:100%; padding:0.9rem; background:#059669; color:#fff; border:none; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                    🖨️ ยืนยันใช้สิทธิ์ / พิมพ์ใบเสร็จ
                  </button>`
                : `<div style="background:#fffbebe6; color:#b45309; padding:0.75rem; border-radius:8px; text-align:center; font-size:0.9rem; border:1px solid #fef3c7;">
                    ⚠️ ไม่พบคูปองหรือสินค้าที่เปิดใช้งานในขณะนี้ (ไม่สามารถพิมพ์ใบเสร็จได้)
                  </div>`
            }
            <button id="btn-open-history" style="width:100%; padding:0.65rem; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:8px; font-size:0.9rem; cursor:pointer;">
              📜 ดูประวัติการใช้สิทธิ์
            </button>
          </div>
        </div>
      </div>

    </div>
  `;

  app.innerHTML = modalHtml;
  document.querySelector('#btn-close-detail').onclick = renderMainUI;

  document.querySelector('#btn-open-history').onclick = () => {
    openHistoryModal(data.phone, data);
  };

  if (hasCouponOrProduct) {
    document.querySelector('#btn-confirm-redeem')?.addEventListener('click', async () => {
      showPrintLoadingDialog('กำลังสร้างเลขบิล...');

      try {
        const generatedBillNo = await window.staffApi.generateBillNo();
        const useAirPrint = !supportsBluetoothPrinting();

        if (!useAirPrint) {
          updatePrintLoadingMessage('กำลังส่งสั่งพิมพ์ไปยังเครื่องพิมพ์ Bluetooth...');
          await runPrint(data, generatedBillNo);
        }

        updatePrintLoadingMessage('กำลังบันทึกข้อมูลการใช้สิทธิ์...');
        await window.staffApi.commitRedeemTransaction(data, generatedBillNo);

        removePrintLoadingDialog();
        if (useAirPrint) {
          showToast('ยืนยันใช้สิทธิ์แล้ว กรุณาเลือกพิมพ์ด้วย AirPrint');
          renderAirPrintReceipt(data, generatedBillNo);
        } else {
          showToast('🎉 พิมพ์ใบเสร็จและใช้สิทธิ์เรียบร้อยแล้ว!');
          renderMainUI();
        }

      } catch (err) {
        console.error(err);
        removePrintLoadingDialog();
        alert(`⚠️ การทำรายการถูกยกเลิก (ยังไม่มีการใช้สิทธิ์): ${err.message}`);
      }
    });
  }
}

// ===== หน้าประวัติการใช้สิทธิ์ (ขยายแสดงผลแบบ Full Screen) =====
async function openHistoryModal(phone, clientData) {
  const modalHtml = `
    <div id="history-modal" class="staff-page">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem;">
        <button class="back" id="btn-close-history" type="button" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">ประวัติการใช้สิทธิ์</h3>
      </div>

      <div style="max-width:600px; width:100%; margin:0 auto; padding:1.25rem; box-sizing:border-box; overflow-y:auto; flex:1;">
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:1.25rem; background:#fff; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <h3 style="margin:0 0 1rem 0; color:#059669; border-bottom:2px solid #059669; padding-bottom:0.4rem;">📜 ประวัติการใช้สิทธิ์ (${maskPhoneNumber(phone)})</h3>
          <div id="history-list-body">
            <p style="text-align:center; color:#666; padding:2rem 0;">กำลังดึงประวัติการใช้สิทธิ์...</p>
          </div>
        </div>
      </div>

    </div>
  `;

  app.innerHTML = modalHtml;
  document.querySelector('#btn-close-history').onclick = () => renderClientDetailPage(clientData);

  try {
    const historyList = await window.staffApi.getHistory(phone);
    const bodyEl = document.querySelector('#history-list-body');

    if (!historyList || historyList.length === 0) {
      bodyEl.innerHTML = `<p style="text-align:center; color:#64748b; padding:2rem 0;">ยังไม่มีประวัติการใช้สิทธิ์</p>`;
      return;
    }

    bodyEl.innerHTML = historyList.map(item => `
      <div style="border-bottom:1px solid #e2e8f0; padding:0.85rem 0; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:bold; color:#1e293b; font-size:0.95rem;">${esc(item.productName)}</div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">เลขบิล: ${esc(item.billNo)} | คูปอง: ${esc(item.couponNo)}</div>
        </div>
        <div style="font-size:0.85rem; color:#059669; font-weight:bold; text-align:right;">
          ${esc(item.useDate)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    document.querySelector('#history-list-body').innerHTML = `
      <p style="text-align:center; color:#dc2626; padding:1rem;">เกิดข้อผิดพลาด: ${esc(err.message)}</p>
    `;
  }
}

// ===== หน้าจัดการตารางสมาชิก House Management (ขยายแสดงผลแบบ Full Screen) =====
async function openHouseManagementModal() {
  if (Number(adminSession?.accessLevel) !== 1) {
    showToast('กรุณายืนยันสิทธิ์แอดมินก่อนจัดการสมาชิก');
    return;
  }
  app.classList.add('member-management-screen');
  const modalHtml = `
    <div id="house-modal" class="staff-page">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:0.5rem; z-index:10;">
        <button class="back" id="btn-close-house-modal" type="button" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h3 style="margin:0; font-size:1.1rem; color:#0284c7;">🏠 จัดการข้อมูลสมาชิก</h3>
      </div>

      <div style="flex:1; overflow-y:auto; padding:1rem; max-width:1000px; width:100%; margin:0 auto; box-sizing:border-box;">
        
        <div style="border:1px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <div style="padding:0.85rem 1rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:0.5rem; flex:1; min-width:240px;">
              <input type="text" id="house-search-input" style="flex:1; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem;" />
              <button id="btn-house-search" style="padding:0.6rem 1rem; background:#0284c7; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">🔍 ค้นหา</button>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button id="btn-house-refresh" style="padding:0.6rem 1rem; background:#475569; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">🔄 รีเฟรช</button>
              <button id="btn-printer-settings" style="padding:0.6rem 1rem; background:#0284c7; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">🖨️ ตั้งค่าเครื่องพิมพ์</button>
              <button id="btn-open-add-house" style="padding:0.6rem 1rem; background:#059669; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">➕ เพิ่มข้อมูลใหม่</button>
            </div>
          </div>

          <div style="padding:1rem; overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem; text-align:left; min-width:700px;">
              <thead>
                <tr style="background:#059669; color:#fff;">
                  <th style="padding:0.75rem;">ชื่อ-นามสกุล</th>
                  <th style="padding:0.75rem;">เบอร์โทรศัพท์</th>
                  <th style="padding:0.75rem;">บ้านเลขที่</th>
                  <th style="padding:0.75rem;">โครงการ</th>
                  <th style="padding:0.75rem; text-align:center;">สิทธิ์/วัน</th>
                  <th style="padding:0.75rem; text-align:center;">ใช้ไปแล้ว</th>
                  <th style="padding:0.75rem; text-align:center;">สิทธิ์ทั้งหมด</th>
                  <th style="padding:0.75rem; text-align:center;">จัดการ</th>
                </tr>
              </thead>
              <tbody id="house-table-body">
                <tr><td colspan="8" style="text-align:center; padding:2rem; color:#64748b;">กำลังโหลดข้อมูล...</td></tr>
              </tbody>
            </table>
          </div>

        </div>

      </div>

    </div>
  `;

  app.innerHTML = modalHtml;
  document.querySelector('#btn-close-house-modal').onclick = renderMainUI;

  document.querySelector('#btn-house-refresh').onclick = async () => {
    const searchInput = document.querySelector('#house-search-input');
    if (searchInput) searchInput.value = '';
    await loadHouseTableData();
    showToast('อัปเดตข้อมูลตารางเรียบร้อยแล้ว');
  };

  document.querySelector('#btn-printer-settings').onclick = openPrinterSettings;

  document.querySelector('#btn-house-search').onclick = filterHouseTable;
  document.querySelector('#house-search-input').onkeyup = (e) => {
    if (e.key === 'Enter') filterHouseTable();
  };

  document.querySelector('#btn-open-add-house').onclick = () => {
    openHouseRecordModal('➕ เพิ่มข้อมูลสมาชิกใหม่', false);
  };

  await loadHouseTableData();
}

// ===== หน้าฟอร์ม เพิ่ม / แก้ไข สมาชิก (ขยายแสดงผลแบบ Full Screen) =====
function openHouseRecordModal(title, isEdit = false, record = null) {
  const modalHtml = `
    <div id="house-record-modal" class="staff-page">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:0.5rem;">
        <button class="back" id="btn-close-record-modal" type="button" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <h3 style="margin:0; font-size:1.1rem; color:#059669;">${esc(title)}</h3>
      </div>

      <div style="max-width:500px; width:100%; margin:0 auto; padding:1.25rem; box-sizing:border-box; overflow-y:auto; flex:1;">
        
        <div style="border:1px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <form id="house-record-form" style="padding:1.25rem; display:flex; flex-direction:column; gap:0.8rem;">
            <input type="hidden" id="h-field-id" value="${esc(record?.id || '')}" />
            
            <div>
              <label style="font-size:0.85rem; font-weight:bold; color:#475569;">ชื่อ - นามสกุล *</label>
              <input type="text" id="h-field-name" value="${esc(record?.name || '')}" required style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:bold; color:#475569;">เบอร์โทรศัพท์ *</label>
              <input type="tel" id="h-field-phone" value="${esc(record?.phone || '')}" required style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:bold; color:#475569;">บ้านเลขที่</label>
              <input type="text" id="h-field-address" value="${esc(record?.address || '')}" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:bold; color:#475569;">โครงการ</label>
              <input type="text" id="h-field-project" value="${esc(record?.project || '')}" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
            </div>
            <div>
              <label style="font-size:0.85rem; font-weight:bold; color:#475569;">สถานะผู้ใช้งาน</label>
              <select id="h-field-access-level" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;">
                <option value="0" ${Number(record?.accessLevel ?? 0) === 0 ? 'selected' : ''}>ผู้ใช้งานทั่วไป</option>
                <option value="1" ${Number(record?.accessLevel) === 1 ? 'selected' : ''}>แอดมิน</option>
              </select>
            </div>

            <div style="display:flex; gap:0.5rem;">
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ / วัน</label>
                <input type="number" id="h-field-quotaPerDay" value="${isEdit ? (record?.quotaPerDay ?? '') : ''}" min="1" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
              </div>
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ที่ใช้แล้ว</label>
                <input type="number" id="h-field-usedCount" value="${isEdit ? (record?.usedCount ?? '') : ''}" min="0" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
              </div>
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ทั้งหมด</label>
                <input type="number" id="h-field-allLimit" value="${isEdit ? (record?.allLimit ?? '') : ''}" min="1" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
              </div>
            </div>

            <div style="margin-top:0.4rem; padding:0.75rem; background:#f1f5f9; border-radius:6px; border:1px solid #e2e8f0;">
              <p style="margin:0; font-size:0.85rem; color:#64748b;">
                ${isEdit ? 'ต้องการรีเซ็ตรหัสผ่านสำหรับเข้าสู่ระบบของสมาชิกรายนี้?' : 'รหัสผ่านเริ่มต้นสำหรับสมาชิกใหม่คือ: 1234'}
              </p>
              ${
                isEdit
                  ? `<button type="button" id="btn-reset-password" style="margin-top:0.5rem; padding:0.4rem 0.8rem; background:#eab308; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:0.85rem;">
                      🔄 Reset รหัสผ่านเป็น 1234
                    </button>`
                  : ''
              }
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.8rem;">
              <button type="button" id="btn-cancel-record-modal" style="padding:0.7rem 1.2rem; background:#64748b; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">ยกเลิก</button>
              <button type="submit" style="padding:0.7rem 1.2rem; background:#059669; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">บันทึกข้อมูล</button>
            </div>
          </form>

        </div>

      </div>

    </div>
  `;

  app.innerHTML = modalHtml;

  const closeForm = () => openHouseManagementModal();

  document.querySelector('#btn-close-record-modal').onclick = closeForm;
  document.querySelector('#btn-cancel-record-modal').onclick = closeForm;

  if (isEdit) {
    document.querySelector('#btn-reset-password')?.addEventListener('click', async () => {
      if (!record?.id) return;
      if (confirm('ยืนยันที่จะรีเซ็ตรหัสผ่านของสมาชิกคนนี้กลับเป็น 1234 ใช่หรือไม่?')) {
        try {
          if (window.staffApi?.resetPassword) {
            await window.staffApi.resetPassword(record.id, '1234');
          } else if (window.staffApi?.saveHouseData) {
            await window.staffApi.saveHouseData({ id: record.id, password: '1234' });
          }
          showToast('รีเซ็ตรหัสผ่านเป็น 1234 เรียบร้อยแล้ว');
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน: ' + err.message);
        }
      }
    });
  }

  const houseForm = document.querySelector('#house-record-form');
  houseForm.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.matches('button, textarea')) return;

    // Enter ใช้เลื่อนไปช่องถัดไปเท่านั้น จึงไม่ส่งฟอร์มและไม่กระตุ้นปุ่มใด ๆ
    const fields = [...houseForm.querySelectorAll('input:not([type="hidden"]), select, textarea')]
      .filter(field => !field.disabled && field.offsetParent !== null);
    const currentIndex = fields.indexOf(e.target);

    if (currentIndex === -1) return;
    e.preventDefault();
    fields[currentIndex + 1]?.focus();
  });

  houseForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.querySelector('#h-field-id').value;
    const quotaVal = parseInt(document.querySelector('#h-field-quotaPerDay').value, 10) || 1;
    
    const payload = {
      id: id || null,
      name: document.querySelector('#h-field-name').value,
      phone: document.querySelector('#h-field-phone').value,
      address: document.querySelector('#h-field-address').value,
      project: document.querySelector('#h-field-project').value,
      quotaPerDay: quotaVal,
      Day_Limit: quotaVal,
      accessLevel: parseInt(document.querySelector('#h-field-access-level').value, 10) || 0,
      isUse: isEdit ? Boolean(record?.isUse) : false,
      usedCount: parseInt(document.querySelector('#h-field-usedCount').value, 10) || 0,
      allLimit: parseInt(document.querySelector('#h-field-allLimit').value, 10) || 10
    };

    if (!id) {
      payload.password = '1234';
    }

    try {
      if (window.staffApi?.saveHouseData) {
        await window.staffApi.saveHouseData(payload);
      }
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว');
      closeForm();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
  };
}

async function loadHouseTableData() {
  const tbody = document.querySelector('#house-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#64748b;">กำลังโหลดข้อมูล...</td></tr>`;

  try {
    if (window.staffApi?.getHouseTableData) {
      currentHouseDataList = await window.staffApi.getHouseTableData();
    } else {
      currentHouseDataList = [];
    }
    renderHouseTable(currentHouseDataList);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#dc2626;">เกิดข้อผิดพลาด: ${esc(err.message)}</td></tr>`;
  }
}

// ===== อัปเดตคอลัมน์การจัดการให้มีปุ่มลบ (🗑️ ลบ) =====
function renderHouseTable(list) {
  const tbody = document.querySelector('#house-table-body');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#64748b;">ไม่พบข้อมูลสมาชิก</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:0.75rem;">${esc(item.name || '-')}</td>
      <td style="padding:0.75rem;">${esc(item.phone || '-')}</td>
      <td style="padding:0.75rem;">${esc(item.address || '-')}</td>
      <td style="padding:0.75rem;">${esc(item.project || '-')}</td>
      <td style="padding:0.75rem; text-align:center;">${item.quotaPerDay ?? 1}</td>
      <td style="padding:0.75rem; text-align:center;">${item.usedCount ?? 0}</td>
      <td style="padding:0.75rem; text-align:center;">${item.allLimit ?? 10}</td>
      <td style="padding:0.75rem; text-align:center;">
        <div style="display:flex; gap:0.4rem; justify-content:center;">
          <button onclick="editHouseRecord('${esc(item.id)}')" style="padding:0.4rem 0.6rem; background:#eab308; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">✏️ แก้ไข</button>
          <button onclick="deleteHouseRecord('${esc(item.id)}', '${esc(item.name)}')" style="padding:0.4rem 0.6rem; background:#dc2626; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">🗑️ ลบ</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ===== เพิ่มฟังก์ชันลบข้อมูลสมาชิก =====
async function deleteHouseRecord(id, name) {
  if (!id) return;

  if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลสมาชิก "${name || 'รายนี้'}" ?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) {
    try {
      if (window.staffApi?.deleteHouseData) {
        await window.staffApi.deleteHouseData(id);
      } else {
        throw new Error('ไม่พบฟังก์ชันลบข้อมูล (window.staffApi.deleteHouseData)');
      }
      showToast('ลบข้อมูลสมาชิกเรียบร้อยแล้ว');
      await loadHouseTableData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message);
    }
  }
}
window.deleteHouseRecord = deleteHouseRecord;

function filterHouseTable() {
  const query = document.querySelector('#house-search-input')?.value.toLowerCase().trim();
  if (!query) {
    renderHouseTable(currentHouseDataList);
    return;
  }

  const filtered = currentHouseDataList.filter(item => {
    return (item.name && item.name.toLowerCase().includes(query)) ||
           (item.phone && item.phone.includes(query)) ||
           (item.project && item.project.toLowerCase().includes(query)) ||
           (item.address && item.address.toLowerCase().includes(query));
  });

  renderHouseTable(filtered);
}

function editHouseRecord(id) {
  const record = currentHouseDataList.find(item => String(item.id) === String(id));
  if (!record) return;
  openHouseRecordModal('✏️ แก้ไขข้อมูลสมาชิก', true, record);
}

function openAdminLoginDialog() {
  const dialogHtml = `
    <div id="admin-login-dialog" style="position:fixed; inset:0; z-index:20000; display:grid; place-items:start center; padding:clamp(24px, 8vh, 80px) 20px 20px; background:rgba(20,40,29,.62);">
      <form id="admin-login-form" style="width:min(100%,360px); display:grid; gap:14px; padding:22px; border-radius:18px; background:#fffaf4; box-shadow:0 20px 45px rgba(0,0,0,.28);">
        <div>
          <h2 style="margin:0; color:#194832; font-size:1.25rem;">ยืนยันสิทธิ์ผู้ดูแล</h2>
          <p style="margin:5px 0 0; color:#766b5e; font-size:.9rem;">เข้าสู่ระบบด้วย User และ Password ของแอดมิน</p>
        </div>
        <label style="display:grid; gap:6px; color:#2c241d;">User (เบอร์โทรศัพท์)
          <input id="admin-username" name="username" type="text" inputmode="tel" autocomplete="username" required>
        </label>
        <label style="display:grid; gap:6px; color:#2c241d;">Password
          <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
        </label>
        <p id="admin-login-error" role="alert" style="display:none; margin:0; color:#b63f35; font-size:.85rem;"></p>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="btn-cancel-admin-login" type="button" style="padding:10px 14px; border-radius:10px; background:#e8efe4; color:#194832; font-weight:700;">ยกเลิก</button>
          <button id="btn-confirm-admin-login" type="submit" style="padding:10px 14px; border-radius:10px; background:#256b45; color:#fff; font-weight:700;">เข้าสู่ระบบ</button>
        </div>
      </form>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', dialogHtml);
  const dialog = document.querySelector('#admin-login-dialog');
  document.querySelector('#btn-cancel-admin-login').onclick = () => dialog.remove();
  document.querySelector('#admin-login-form').onsubmit = async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector('#btn-confirm-admin-login');
    const errorEl = document.querySelector('#admin-login-error');
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังตรวจสอบ...';
    errorEl.style.display = 'none';

    try {
      const formData = new FormData(event.currentTarget);
      adminSession = await window.staffApi.verifyAdminCredentials(formData.get('username'), formData.get('password'));
      dialog.remove();
      openHouseManagementModal();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      submitButton.disabled = false;
      submitButton.textContent = 'เข้าสู่ระบบ';
    }
  };
}

// ===== หน้าหลัก UI =====
function renderMainUI() {
  app.classList.remove('member-management-screen');
  app.innerHTML = `
    <div class="shell staff-main-shell" style="max-width: 480px; margin: 0 auto; padding: 1rem; font-family: sans-serif; position: relative; min-height: 80vh;">
      <header style="text-align: center; margin-bottom: 1.5rem;">
        <img 
          src="public/assets/image/icon-192.png" 
          alt="D House X Cafe Amazon Logo" 
          style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 12px;"
        >
        <h1 style="color: #fff; margin: 0; font-size: 1.5rem;">D House x Café Amazon</h1>
        <p style="color: #f5eee3; margin-top: 0.25rem;">สแกน QR Code เพื่อใช้สิทธิ์และพิมพ์ใบเสร็จ</p>
      </header>

      <div class="card" style="border: 1px solid #ddd; border-radius: 12px; padding: 1rem; background: #fff; margin-bottom: 1rem; text-align: center;">
        <div id="reader" style="width:100%; max-width:100%; box-sizing:border-box; border-radius:8px; overflow:hidden; background:#000; display:none; margin-bottom:0.75rem;"></div>
        <p id="scanner-status" aria-live="polite" style="margin:0 0 .75rem; color:#766b5e; font-size:.85rem;"></p>
        <button id="btn-toggle-camera" style="width: 100%; padding: 0.85rem; background: #059669; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem;">
          📷 เปิดกล้องสแกน QR Code
        </button>
      </div>

      <button 
        id="btn-manage-member" 
        title="จัดการข้อมูลสมาชิก"
        style="
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #0284c7;
          color: #fff;
          border: none;
          font-size: 1.4rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
          z-index: 1000;
          transition: transform 0.2s;
        "
        onmouseover="this.style.transform='scale(1.08)'"
        onmouseout="this.style.transform='scale(1)'"
      >
        👤
      </button>
      <button
        id="btn-test-print"
        type="button"
        title="ทดสอบพิมพ์"
        style="
          position:fixed;
          right:20px;
          bottom:20px;
          padding:0.72rem 0.95rem;
          border:0;
          border-radius:999px;
          background:#0284c7;
          color:#fff;
          font-weight:bold;
          cursor:pointer;
          font-size:.9rem;
          box-shadow:0 4px 10px rgba(0,0,0,.25);
          z-index:1000;
        ">
        🖨️ ทดสอบพิมพ์
      </button>
    </div>
  `;

  document.querySelector('#btn-manage-member').onclick = () => openAdminLoginDialog();

  document.querySelector('#btn-toggle-camera').onclick = () => {
    if (html5QrCode && html5QrCode.isScanning) stopScanner();
    else startScanner();
  };

  document.querySelector('#btn-test-print').onclick = printTestReceipt;

  setTimeout(showInstallGuide, 400);
}

// โหลดหน้าจอหลักเมื่อเริ่มต้น
renderMainUI();
