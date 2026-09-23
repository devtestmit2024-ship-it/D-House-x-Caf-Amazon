// app.js (ระบบพนักงานขาย + พิมพ์ใบเสร็จ BLE + สแกน QR Code + จัดการตาราง Cafe_Amazon_Promosion_House)
const app = document.querySelector('#app');
let html5QrCode = null;
let bluetoothDevice = null;
let bluetoothCharacteristic = null;
let currentHouseDataList = [];

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

function createToastEl() {
  const el = document.createElement('div');
  el.id = 'toast';
  document.body.appendChild(el);
  return el;
}

// ===== ระบบเครื่องพิมพ์ Bluetooth (BLE) =====
const PRINT_WIDTH_DOTS = 384;
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

  if (!bluetoothDevice && navigator.bluetooth.getDevices) {
    const pairedDevices = await navigator.bluetooth.getDevices();
    if (pairedDevices.length > 0) {
      bluetoothDevice = pairedDevices[0];
      showToast(`กำลังเชื่อมต่อเครื่องพิมพ์เดิม: ${bluetoothDevice.name || 'Bluetooth Printer'}`);
    }
  }

  if (!bluetoothDevice) {
    showToast('ไม่พบเครื่องพิมพ์ที่เคยจับคู่ไว้ กรุณาเลือกเครื่องพิมพ์...');
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });
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

// ===== ระบบสแกนกล้อง QR Code =====
async function startScanner() {
  const readerEl = document.querySelector('#reader');
  const btn = document.querySelector('#btn-toggle-camera');
  if (!readerEl) return;

  readerEl.style.display = 'block';
  if (btn) {
    btn.textContent = '❌ ปิดกล้องสแกน';
    btn.style.background = '#dc2626';
  }

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('reader');
  }

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      async (decodedText) => {
        showToast('สแกนสำเร็จ!');
        await stopScanner();
        
        const cleanedKey = parseScanResult(decodedText);
        await processPhoneQuery(cleanedKey);
      },
      () => {}
    );
  } catch (err) {
    console.error('Camera Error:', err);
    showToast('ไม่สามารถเปิดกล้องได้: ' + err.message);
    stopScanner();
  }
}

function parseScanResult(rawText) {
  if (!rawText) return '';
  let str = String(rawText).trim();

  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const url = new URL(str);
      const phoneParam = url.searchParams.get('phone') || url.searchParams.get('tel') || url.searchParams.get('code') || url.searchParams.get('key');
      if (phoneParam) return phoneParam.trim();
    }
  } catch (e) {}

  const phoneMatch = str.match(/0\d{8,9}/);
  if (phoneMatch) return phoneMatch[0];

  const couponMatch = str.match(/CPN-[A-Za-z0-9]+/i);
  if (couponMatch) return couponMatch[0].toUpperCase();

  return str;
}

async function stopScanner() {
  const readerEl = document.querySelector('#reader');
  const btn = document.querySelector('#btn-toggle-camera');

  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {}
  }

  if (readerEl) readerEl.style.display = 'none';
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

async function processPhoneQuery(phone) {
  showPrintLoadingDialog('กำลังค้นหาข้อมูลสมาชิก...');

  try {
    const data = await window.staffApi.checkCouponInfo(phone);
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
    <div id="client-detail-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#f8fafc; z-index:9999; display:flex; flex-direction:column; overflow-y:auto; font-family:sans-serif;">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem; sticky:top; top:0; z-index:10;">
        <button id="btn-close-detail" style="padding:0.6rem 1rem; background:#64748b; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem;">
          ← กลับ
        </button>
        <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">ข้อมูลสมาชิก</h3>
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

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const detailModal = document.querySelector('#client-detail-modal');
  document.querySelector('#btn-close-detail').onclick = () => detailModal.remove();

  document.querySelector('#btn-open-history').onclick = () => {
    openHistoryModal(data.phone);
  };

  if (hasCouponOrProduct) {
    document.querySelector('#btn-confirm-redeem')?.addEventListener('click', async () => {
      showPrintLoadingDialog('กำลังสร้างเลขบิล...');

      try {
        const generatedBillNo = await window.staffApi.generateBillNo();

        updatePrintLoadingMessage('กำลังส่งสั่งพิมพ์ไปยังเครื่องพิมพ์...');
        await runPrint(data, generatedBillNo);

        updatePrintLoadingMessage('กำลังบันทึกข้อมูลการใช้สิทธิ์...');
        await window.staffApi.commitRedeemTransaction(data, generatedBillNo);

        removePrintLoadingDialog();
        showToast('🎉 พิมพ์ใบเสร็จและใช้สิทธิ์เรียบร้อยแล้ว!');
        detailModal.remove();

      } catch (err) {
        console.error(err);
        removePrintLoadingDialog();
        alert(`⚠️ การทำรายการถูกยกเลิก (ยังไม่มีการใช้สิทธิ์): ${err.message}`);
      }
    });
  }
}

// ===== หน้าประวัติการใช้สิทธิ์ (ขยายแสดงผลแบบ Full Screen) =====
async function openHistoryModal(phone) {
  const modalHtml = `
    <div id="history-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#f8fafc; z-index:10000; display:flex; flex-direction:column; font-family:sans-serif;">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:0.5rem;">
        <button id="btn-close-history" style="padding:0.6rem 1rem; background:#64748b; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem;">
          ← กลับ
        </button>
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

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const historyModal = document.querySelector('#history-modal');
  document.querySelector('#btn-close-history').onclick = () => historyModal.remove();

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
  const modalHtml = `
    <div id="house-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#f8fafc; z-index:9999; display:flex; flex-direction:column; font-family:sans-serif;">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:0.5rem; z-index:10;">
        <button id="btn-close-house-modal" style="padding:0.6rem 1rem; background:#64748b; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem;">
          ← กลับ
        </button>
        <h3 style="margin:0; font-size:1.1rem; color:#0284c7;">🏠 จัดการตารางข้อมูลสมาชิก</h3>
      </div>

      <div style="flex:1; overflow-y:auto; padding:1rem; max-width:1000px; width:100%; margin:0 auto; box-sizing:border-box;">
        
        <div style="border:1px solid #cbd5e1; border-radius:12px; background:#fff; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <div style="padding:0.85rem 1rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:0.5rem; flex:1; min-width:240px;">
              <input type="text" id="house-search-input" placeholder="ค้นหา ชื่อ, เบอร์โทร, หรือ โครงการ..." style="flex:1; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem;" />
              <button id="btn-house-search" style="padding:0.6rem 1rem; background:#0284c7; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">🔍 ค้นหา</button>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button id="btn-house-refresh" style="padding:0.6rem 1rem; background:#475569; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.9rem;">🔄 รีเฟรช</button>
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

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const houseModal = document.querySelector('#house-modal');
  document.querySelector('#btn-close-house-modal').onclick = () => houseModal.remove();

  document.querySelector('#btn-house-refresh').onclick = async () => {
    const searchInput = document.querySelector('#house-search-input');
    if (searchInput) searchInput.value = '';
    await loadHouseTableData();
    showToast('อัปเดตข้อมูลตารางเรียบร้อยแล้ว');
  };

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
    <div id="house-record-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#f8fafc; z-index:10000; display:flex; flex-direction:column; font-family:sans-serif;">
      
      <div style="padding:1rem; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; gap:0.5rem;">
        <button id="btn-close-record-modal" style="padding:0.6rem 1rem; background:#64748b; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:0.95rem;">
          ← กลับ
        </button>
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

            <div style="display:flex; gap:0.5rem;">
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ / วัน</label>
                <input type="number" id="h-field-quotaPerDay" value="${record?.quotaPerDay ?? 1}" min="1" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
              </div>
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ที่ใช้แล้ว</label>
                <input type="number" id="h-field-usedCount" value="${record?.usedCount ?? 0}" min="0" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
              </div>
              <div style="flex:1;">
                <label style="font-size:0.8rem; font-weight:bold; color:#475569;">สิทธิ์ทั้งหมด</label>
                <input type="number" id="h-field-allLimit" value="${record?.allLimit ?? 10}" min="1" style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; font-size:0.95rem;" />
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

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const recordModal = document.querySelector('#house-record-modal');
  const closeForm = () => recordModal.remove();

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
    if (e.key === 'Enter') {
      e.preventDefault();
      return false;
    }
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
      IsUse: true,
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
      await loadHouseTableData();
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

// ===== หน้าหลัก UI =====
function renderMainUI() {
  app.innerHTML = `
    <div class="shell" style="max-width: 480px; margin: 0 auto; padding: 1rem; font-family: sans-serif; position: relative; min-height: 80vh;">
      <header style="text-align: center; margin-bottom: 1.5rem;">
        <img 
          src="public/assets/image/icon-192.png" 
          alt="D House X Cafe Amazon Logo" 
          style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 12px;"
        >
        <h1 style="color: #059669; margin: 0; font-size: 1.5rem;">D House x Café Amazon</h1>
        <p style="color: #666; margin-top: 0.25rem;">สแกน QR Code เพื่อใช้สิทธิ์และพิมพ์ใบเสร็จ</p>
      </header>

      <div class="card" style="border: 1px solid #ddd; border-radius: 12px; padding: 1rem; background: #fff; margin-bottom: 1rem; text-align: center;">
        <div id="reader" style="width:100%; max-width:100%; box-sizing:border-box; border-radius:8px; overflow:hidden; background:#000; display:none; margin-bottom:0.75rem;"></div>
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
    </div>
  `;

  document.querySelector('#btn-manage-member').onclick = () => openHouseManagementModal();

  document.querySelector('#btn-toggle-camera').onclick = () => {
    if (html5QrCode && html5QrCode.isScanning) stopScanner();
    else startScanner();
  };
}

// โหลดหน้าจอหลักเมื่อเริ่มต้น
renderMainUI();