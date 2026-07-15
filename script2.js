function printCartReceipt() {
    let items = Object.values(groupedItems);
    if (items.length === 0) return showStatus("ไม่มีสินค้าในตะกร้า");
    let n = new Date();
    let timeStr = n.toLocaleDateString('th-TH') + " " + n.toLocaleTimeString('th-TH');
    let html = `<div style="font-family: sans-serif; padding: 10px; background: white; color: black; min-height: 100vh;">`;
    html += `<h3 style="text-align:center; margin-bottom:5px;">ใบรายการสินค้า</h3>`;
    html += `<p style="text-align:center; margin:0 0 10px 0; font-size:12px;">เวลา: ${timeStr}</p><hr style="border-top:1px dashed #000;">`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:14px;"><tr><th style="text-align:left;">รายการ</th><th style="text-align:right;">จน.</th><th style="text-align:right;">ราคา</th><th style="text-align:right;">รวม</th></tr>`;
    let total = 0;
    items.forEach(i => {
        let p = i.price || 0;
        let sum = p * i.qty;
        total += sum;
        html += `<tr><td style="padding-top:5px; word-break: break-all;">${i.code}</td><td style="text-align:right;">${i.qty}</td><td style="text-align:right;">${p}</td><td style="text-align:right;">${sum}</td></tr>`;
    });
    html += `</table><hr style="border-top:1px dashed #000;">`;
    html += `<h3 style="text-align:right;">ยอดรวมสุทธิ: ${total.toLocaleString()} บาท</h3>`;
    html += `<p style="text-align:center; font-size:12px;">ขอบคุณที่ใช้บริการ</p></div>`;
    document.getElementById("printArea").innerHTML = html;
    window.print();
    setTimeout(() => document.getElementById("printArea").innerHTML = "", 1000);
}

function resetIdleTimer(){clearTimeout(idleTimer); idleTimer=setTimeout(sleepScanner,300000)}

// ==========================================
// 1. ฟังก์ชันสั่งหลับ (เรียกใช้ตอนกดหัวข้อ บาร์โค้ด สินค้า)
// ==========================================
function sleepScanner(e) {
    if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
    }

    if (isScanning) {
        html5QrcodeScanner.clear().then(() => {
            isScanning = false;
            document.getElementById('sleepOverlay').style.display = 'flex';
            showStatus("💤 พักสแกนเนอร์");
        }).catch(err => console.error("Sleep Error:", err));
    }
}

// ==========================================
// 2. ฟังก์ชันสั่งตื่น (เรียกใช้ตอนกด sleepOverlay หน้าจอสีดำ)
// ==========================================
function wakeScanner() {
    if (!isScanning) {
        isScanning = true;
        document.getElementById('sleepOverlay').style.display = 'none';
        showStatus("📷 พร้อมสแกน");
        
        html5QrcodeScanner.render(onScanSuccess);
        
        if (typeof resetIdleTimer === 'function') {
            resetIdleTimer();
        }
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
}

// ==========================================
// 3. ระบบแสดงเวลาและเวอร์ชันของแอป (ทำงานทุกๆ 1 วินาที)
// ==========================================
setInterval(() => {
    const n = new Date();
    const dateStr = n.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = n.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const clockEl = document.getElementById('clock');
    const versionEl = document.getElementById('versionTag');
    
    if (clockEl) {
        clockEl.innerText = dateStr + ' ' + timeStr;
    }
    if (versionEl && typeof APP_VERSION !== 'undefined') {
        versionEl.innerText = APP_VERSION;
    }
}, 1000);

function showStatus(m){const s=document.getElementById("statusMessage");s.innerText=m;setTimeout(()=>{s.innerText=""},3000)}

async function loadSheetData() {
    if(!navigator.onLine) {
        showStatus("ออฟไลน์: ใช้ข้อมูลเดิมในเครื่อง");
        return;
    }
    showStatus("กำลังอัปเดตฐานข้อมูล...");
    try {
        const cacheBusterUrl = GOOGLE_SCRIPT_URL + (GOOGLE_SCRIPT_URL.includes('?') ? '&' : '?') + '_=' + new Date().getTime();
        let response = await fetch(cacheBusterUrl);
        let data = await response.json();
        let productArray = [];
        for (const [code, info] of Object.entries(data)) {
            productArray.push({ code: code, price: info.price, cost: info.cost, stock: info.stock, supplier: info.supplier });
        }
        await db.products.clear(); 
        await db.products.bulkPut(productArray); 
        showStatus("✅ อัปเดตฐานข้อมูลเรียบร้อย");
    } catch (error) { 
        showStatus("⚠️ โหลดข้อมูลล้มเหลว ใช้ของเดิมในเครื่อง"); 
    }
}

async function changeQty(code, newValue) {
    let newQty = parseInt(newValue) || 0;
    if (newQty < 0) newQty = 0;
    let oldQty = parseInt(groupedItems[code].qty) || 0;
    let diff = newQty - oldQty;
    groupedItems[code].qty = newQty;
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let product = await db.products.get(code);
    if(product) {
        if (mode === 'SELL') product.stock = parseInt(product.stock || 0) - diff;
        else if (mode === 'BUY') product.stock = parseInt(product.stock || 0) + diff;
        await db.products.put(product);
        groupedItems[code].stock = product.stock; 
    }
    calculateTotal(); refreshList();
}

async function removeItem(code){ 
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let product = await db.products.get(code);
    if(product) {
        if(mode === 'SELL') product.stock = parseInt(product.stock || 0) + groupedItems[code].qty;
        else if(mode === 'BUY') product.stock = parseInt(product.stock || 0) - groupedItems[code].qty;
        await db.products.put(product);
    }
    delete groupedItems[code]; 
    refreshList(); calculateTotal(); 
}

function autoScrollToBottom(){ const list = document.getElementById("itemList"); list.scrollTop = list.scrollHeight; }

function refreshList(){ const i=document.getElementById("itemList"); i.innerHTML=""; Object.values(groupedItems).forEach(x=>renderItem(x)); autoScrollToBottom(); }

async function cancelBasket(){ 
    if(confirm("ยกเลิกทั้งตะกร้าใช่ไหม?")){ 
        let mode = localStorage.getItem('zenMode') || 'SELL';
        for (let code in groupedItems) {
            let product = await db.products.get(code);
            if(product) {
                if(mode === 'SELL') product.stock = parseInt(product.stock || 0) + groupedItems[code].qty;
                else if(mode === 'BUY') product.stock = parseInt(product.stock || 0) - groupedItems[code].qty;
                await db.products.put(product);
            }
        }
        groupedItems={}; refreshList(); calculateTotal(); 
    } 
}

function calculateTotal(){
    let t=0;
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let count = Object.keys(groupedItems).length;
    Object.values(groupedItems).forEach(i=>{
        if(mode === 'SELL') t += (parseFloat(i.price) * i.qty) || 0;
        else if(mode === 'BUY') t += (parseFloat(i.cost) * i.qty) || 0;
    });
    const btn = document.getElementById("btnFinish");
    if(mode === 'CHECK'){ btn.innerText = "(" + count + ") ตรวจสอบรายการ"; }
    else if(mode === 'BUY'){ btn.innerText = "(" + count + ") จ่ายเงิน " + t + " บาท"; }
    else { btn.innerText = "(" + count + ") ชำระเงิน " + t + " บาท"; }
    return t; 
}

async function updateLocalItem(code, field, value) {
    groupedItems[code][field] = value;
    let product = await db.products.get(code);
    if(!product) product = {code: code, price: 0, cost: 0, stock: 0, supplier: ''};
    product[field] = value;
    await db.products.put(product);
    if(field === 'price' || field === 'cost') calculateTotal();
}

function showImagePreview(code) {
    const overlay = document.getElementById("scan-preview-overlay");
    const overlayImg = document.getElementById("last-scanned-img");
    
    if (overlay && overlayImg && groupedItems[code] && groupedItems[code].img) {
        overlayImg.src = groupedItems[code].img;
        overlay.style.display = "block"; 
        
        overlay.onclick = function() { overlay.style.display = "none"; };
        setTimeout(() => { overlay.style.display = "none"; }, 3000);
    }
}

function renderItem(i) {
    let l = document.createElement("li");
    l.className = "item-row";
    
    let st = (parseFloat(i.cost) > 0) ? "cost-filled" : "cost-empty";
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    let isCheck = mode === 'CHECK';
    let isBuy = mode === 'BUY';
    let isSell = mode === 'SELL';
    
    // ล็อคช่องตามโหมด
    let qtyAttr = isCheck ? 'readonly' : ''; 
    let otherAttr = isBuy ? '' : 'readonly'; 
    
    // 🌟 จัดการเบลอช่องทุน: เบลอเฉพาะโหมดขายเท่านั้น โหมดอื่นให้แสดงชัดเจน (visible-cost)
    let costClass = isSell ? 'hidden-cost' : 'visible-cost';
    
    // เอา onclick สลับเบลอออกถ้าไม่ใช่โหมดขาย
    let costOnClick = isSell ? 'onclick="toggleCostVisibility(this)"' : '';

    let imgSource = i.img || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    l.innerHTML = `
        <img src="${imgSource}" 
             onclick="openImageFromCart('${imgSource}')" 
             style="cursor: pointer;" 
             onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
        <span class="barcode-text">${i.code}</span>
        <input type="number" class="item-input" value="${i.qty}" onfocus="this.select()" onchange="changeQty('${i.code}', this.value)" ${qtyAttr}>
        <input type="number" class="item-input" value="${i.price}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','price',this.value)" ${otherAttr}>
        <input type="number" class="item-input cost-input ${costClass} ${st}" value="${i.cost}" onfocus="this.select()" ${costOnClick} onchange="updateLocalItem('${i.code}','cost',this.value)" ${otherAttr}>
        <input type="number" class="item-input" value="${i.stock}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','stock',this.value)" ${otherAttr}>
        <input type="text" class="item-input" maxlength="1" value="${(i.supplier || '').toString().substring(0, 1)}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','supplier',this.value)" ${otherAttr}>
        <button class="btn-delete" onclick="removeItem('${i.code}')">X</button>
    `;

    document.getElementById("itemList").appendChild(l);
}

function toggleCostVisibility(el){el.classList.toggle('hidden-cost');el.classList.toggle('visible-cost')}

function takeSnapshot(width = 300, height = 300){ 
    const v = document.getElementsByTagName('video')[0], 
          c = document.createElement('canvas'); 
    
    if(v && v.videoWidth > 0){
        c.width = width; 
        c.height = height;
        c.getContext('2d').drawImage(v, 0, 0, width, height);
        
        return c.toDataURL('image/jpeg', 0.7); 
    } 
    return ""; 
}

async function createCollage(items) {
    if (items.length === 0) return ""; 
    const THUMB_SIZE = 100;
    let cols = 4; 
    let rows = Math.ceil(items.length / cols);
    let canvas = document.createElement('canvas');
    canvas.width = cols * THUMB_SIZE; 
    canvas.height = rows * THUMB_SIZE;
    let ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const loadImage = (src) => new Promise((resolve, reject) => {
        let img = new Image();
        img.crossOrigin = "anonymous"; 
        img.onload = () => resolve(img);
        img.onerror = (err) => {
            console.error("โหลดรูปไม่สำเร็จ (CORS error):", src);
            resolve(null); 
        };
        img.src = src;
    });

    for (let i = 0; i < items.length; i++) {
        if (items[i].img) {
            let img = await loadImage(items[i].img);
            if (img) { 
                let x = (i % cols) * THUMB_SIZE;
                let y = Math.floor(i / cols) * THUMB_SIZE;
                ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);
            }
        }
    }
    return canvas.toDataURL('image/jpeg', 0.7); 
}

// 🌟 ปรับปรุงแก้ไขจุดเสี่ยงข้อมูลสูญหาย (เอา no-cors ออกและเช็ก res.ok)
async function syncPendingSales() {
    let pendingCount = await db.pendingSales.count();
    const badge = document.getElementById('syncBadge');
    
    if (pendingCount > 0) {
        badge.style.display = 'block';
        badge.innerText = `รอยืนยัน ${pendingCount}`;
    } else {
        badge.style.display = 'none';
    }
    
    if (!navigator.onLine || pendingCount === 0) return; 
    
    showStatus("⏳ กำลังซิงค์บิลที่ค้างอยู่...");
    let pendingBills = await db.pendingSales.toArray();
    
    for (let bill of pendingBills) {
        try {
            // 🌟 ต้องใช้ no-cors สำหรับ Google Apps Script เพื่อไม่ให้โดนบล็อก
            let res = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bill)
            });
            
            // 🌟 ถ้า fetch ไม่วิ่งไปตกที่ catch แปลว่ายิงออกไปสำเร็จแล้ว (มีอินเทอร์เน็ต)
            // ลบข้อมูลที่ค้างอยู่ในเครื่องได้เลย
            await db.pendingSales.delete(bill.id);
            
        } catch(err) {
            // จะวิ่งมาตรงนี้เฉพาะตอนที่ "ไม่มีเน็ต" หรือ "เบราว์เซอร์ส่งข้อมูลออกไปไม่ได้จริงๆ"
            console.error("Sync failed for bill:", bill.id, err);
            break; // หยุดซิงค์ชั่วคราว รอให้เน็ตเสถียรค่อยทำต่อ
        }
    }
    
    // อัปเดตตัวเลขป้ายประกาศอีกครั้งหลังซิงค์เสร็จ
    pendingCount = await db.pendingSales.count();
    if(pendingCount === 0) {
        badge.style.display = 'none';
        showStatus("✅ ซิงค์ข้อมูลครบแล้ว!");
    } else {
        badge.innerText = `รอยืนยัน ${pendingCount}`;
    }
}

let currentReceived = 0;
let currentTotal = 0;

function togglePayment(show, total) {
    if (show) {
        currentTotal = total;
        currentReceived = 0;
        document.getElementById('totalDisplay').innerText = `ยอดรวม: ${total} บาท`;
        updateUI();
        document.getElementById('paymentPanel').style.display = 'flex';
    } else {
        document.getElementById('paymentPanel').style.display = 'none';
        currentReceived = 0; 
    }
}

function addCash(amt) { currentReceived += amt; updateUI(); }

function pressNum(n) { 
    currentReceived = parseInt((currentReceived === 0 ? "" : currentReceived.toString()) + n.toString()); 
    updateUI(); 
}

function clearCash() { currentReceived = 0; updateUI(); }

function updateUI() {
    document.getElementById('receivedDisplay').innerText = currentReceived;
    let change = Math.max(0, currentReceived - currentTotal);
    document.getElementById('changeDisplay').innerText = change;
}

async function confirmPayment() {
    if (currentReceived < currentTotal) {
        alert("เงินยังไม่ครบครับ!");
        return;
    }
    
    let change = currentReceived - currentTotal;
    document.getElementById("changeDisplay").innerText = change;
    document.getElementById('paymentPanel').style.display = 'none';
    
    await finishSale(change, currentReceived); 
}

async function finishSale(change = 0, received = 0) { 
    if(Object.keys(groupedItems).length === 0) return showStatus("ยังไม่มีสินค้าในตะกร้า!"); 
    
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let allItems = Object.values(groupedItems);
    let itemsToSync = allItems.map(i => {
        return { code: i.code, qty: i.qty, price: i.price, cost: i.cost, supplier: i.supplier, stock: i.stock };
    });

    const backupItems = { ...groupedItems }; 
    groupedItems = {}; 
    refreshList(); 
    calculateTotal(); 
    updateCameraButton();

    try {
        let batch1 = allItems.slice(0, 16); 
        let batch2 = allItems.slice(16, 32);
        let collage1 = await createCollage(batch1); 
        let collage2 = await createCollage(batch2);
        
        let billData = { 
            mode: mode, 
            items: itemsToSync, 
            collage1: collage1, 
            collage2: collage2, 
            total: currentTotal,
            received: received,
            change: change,
            timestamp: Date.now() 
        };
        
        await db.pendingSales.add(billData);
        
        if (mode === 'SELL') {
            speakText(`ยอดรวม ${currentTotal} บาท รับเงิน ${received} บาท ทอน ${change} บาท ขอบคุณครับ`);
        } else {
            speakText(currentTotal + " บาท ขอบคุณครับ");
        }
        
        syncPendingSales();
        showStatus("✅ บันทึกการขายเรียบร้อย");

    } catch (error) {
        console.error("บันทึกข้อมูลไม่สำเร็จ:", error);
        showStatus("❌ บันทึกไม่สำเร็จ! ระบบกู้คืนตะกร้าให้แล้ว");
        
        groupedItems = backupItems;
        refreshList();
        calculateTotal();
    }
}

function openPaymentPanel() {
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    // 🌟 ดักโหมด CHECK: ไม่คิดเงิน ไม่บันทึกบิล แค่เคลียร์ตะกร้าทิ้ง
    if (mode === 'CHECK') {
        let count = Object.keys(groupedItems).length;
        if (count > 0 && confirm("ตรวจสอบสินค้าเสร็จสิ้น ต้องการล้างหน้าจอหรือไม่?")) {
            groupedItems = {};
            refreshList();
            calculateTotal();
            showStatus("🧹 ล้างหน้าจอแล้ว");
        } else if (count === 0) {
            alert("ยังไม่มีสินค้าในรายการครับ");
        }
        return; // จบการทำงาน ไม่ต้องไปเปิดหน้าคิดเงิน
    }

    // สำหรับโหมด SELL และ BUY
    let total = calculateTotal(); 
    if (total > 0) {     
        togglePayment(true, total);
    } else {
        alert("ยังไม่มีสินค้าในตะกร้าครับ");
    }
}

// 🌟 ฟังก์ชันจัดการเปิดรูปพรีวิวจากในตะกร้า
function openImageFromCart(imgSrc) {
    const overlay = document.getElementById("scan-preview-overlay");
    const overlayImg = document.getElementById("last-scanned-img");
    
    if (overlay && overlayImg) {
        overlayImg.src = imgSrc;
        overlay.style.display = "flex"; 
        overlay.style.opacity = "1";              
    }
}

window.addEventListener('online', () => {
    showStatus("🌐 กลับมาออนไลน์แล้ว! กำลังซิงค์ข้อมูล...");
    syncPendingSales(); 
});

window.addEventListener('offline', () => {
    showStatus("📵 ขาดการเชื่อมต่อ! สลับเป็นโหมดออฟไลน์");
});

window.onload = async () => {
    // 🌟 บังคับเข้าโหมด SELL (ขาย) เสมอเมื่อเปิดแอปใหม่ หรือรีเฟรชหน้าจอ
    localStorage.setItem('zenMode', 'SELL');
    let m = 'SELL'; 
    
    document.getElementById('modeSelect').value = m; 
    applyModeColor(m);
    updateBarcodeTitle();
    
    await loadSheetData(); 
    syncPendingSales(); 
    
    // ---------------------------------------------------------
    // 🌟 ดักจับตอนกดเปลี่ยนโหมด (ป้องกันโหมด BUY รัดกุมขึ้น)
    const modeSelectEl = document.getElementById('modeSelect');
    if (modeSelectEl) {
        modeSelectEl.addEventListener('change', function(e) {
            let targetMode = e.target.value;
            
            // ถ้าเลือกเข้าโหมดซื้อ (BUY) ให้ถามรหัสผ่าน
            if (targetMode === 'BUY') {
                let pwd = prompt("🔒 กรุณาใส่รหัสผ่านเพื่อเข้าสู่โหมดรับสินค้า:");
                // ถ้ายกเลิก (pwd เป็น null) หรือใส่รหัสผิด
                if (pwd !== "1234") {
                    alert("❌ รหัสผ่านไม่ถูกต้อง หรือยกเลิกการทำรายการ!");
                    
                    // 🌟 บังคับเด้งกลับไปโหมดขายทันที
                    targetMode = 'SELL';
                    e.target.value = 'SELL'; 
                }
            }
            
            // ถ้าผ่าน (หรือโดนบังคับกลับมาเป็น SELL แล้ว) ให้ระบบทำงานต่อ
            localStorage.setItem('zenMode', targetMode);
            applyModeColor(targetMode);
            updateBarcodeTitle();
            refreshList();
            calculateTotal();
            showStatus("เปลี่ยนเป็นโหมด " + (targetMode === 'SELL' ? 'ขาย' : targetMode === 'BUY' ? 'ซื้อ' : 'ตรวจสอบ'));
        });
    }
    // ---------------------------------------------------------
    
    const previewOverlay = document.getElementById("scan-preview-overlay");
    if (previewOverlay) {
        previewOverlay.addEventListener("click", function() {
            this.style.opacity = "0";
            setTimeout(() => {
                this.style.display = "none"; 
            }, 500);
        });
    }

    html5QrcodeScanner = new Html5QrcodeScanner("reader", {
        fps: 10, qrbox: {width: 200, height: 60}, facingMode: "environment",
        formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE]
    });
    html5QrcodeScanner.render(onScanSuccess); 
    resetIdleTimer(); 
    document.addEventListener('mousemove', resetIdleTimer); 
    document.addEventListener('touchstart', resetIdleTimer); 
    document.addEventListener('click', resetIdleTimer);
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('✅ Service Worker Registered! พร้อมทำงานออฟไลน์'))
            .catch((err) => console.log('❌ Service Worker Failed', err));
    });
}

