const APP_VERSION = "v.1.3"; // 🌟 อัปเดตเวอร์ชัน
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbycg8de6efutKRLsoT8s6AQh3eJaEGmSOUV4kP4jhO9iUMimOzT3tbtcQcJaZArsyzb/exec";

const db = new Dexie("ShopDatabase");
db.version(1).stores({
    products: 'code, price, cost, stock, supplier',
    pendingSales: '++id, mode, items, collage1, collage2, timestamp'
});

let groupedItems={}, html5QrcodeScanner, idleTimer, isScanning=true;
let currentSpeech = null;

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        currentSpeech = new SpeechSynthesisUtterance(text);
        currentSpeech.lang = 'th-TH';
        window.speechSynthesis.speak(currentSpeech);
    }
}

function applyModeColor(mode){
    const header = document.getElementById('headerBar');
    const btn = document.getElementById('btnFinish');
    const btnNewBarcode = document.getElementById('btnNewBarcode');
    const colors = {'SELL':'#27ae60', 'BUY':'#f1c40f', 'CHECK':'#3498db'};
    
    header.style.backgroundColor = colors[mode] || '#27ae60';
    btn.style.backgroundColor = colors[mode] || '#27ae60';
    
    btnNewBarcode.style.display = (mode === 'CHECK') ? 'block' : 'none';
    
    cancelPreview(null, true);
}

function changeMode(m){
    localStorage.setItem('zenMode',m);
    applyModeColor(m);
    showStatus("โหมด: "+m);
    calculateTotal();
    refreshList();
}

function showBarcodePreview(event) {
    if(event) event.stopPropagation();
    
    const v = document.getElementsByTagName('video')[0];
    if (!v || v.videoWidth === 0) {
        return showStatus("⚠️ ไม่พบกล้อง กรุณารอให้กล้องทำงานก่อน");
    }

    const c = document.createElement('canvas');
    c.width = 800; c.height = 800;
    const ctx = c.getContext('2d');
    const size = Math.min(v.videoWidth, v.videoHeight);
    const xOffset = (v.videoWidth - size) / 2;
    const yOffset = (v.videoHeight - size) / 2;
    
    ctx.drawImage(v, xOffset, yOffset, size, size, 0, 0, 800, 800);
    const highResImg = c.toDataURL('image/jpeg', 0.8);

    const randomCode = "99" + Math.floor(10000000000 + Math.random() * 90000000000).toString().substring(0, 11);
    db.products.put({ code: randomCode, price: 0, cost: 0, stock: 0, supplier: 'NEW' });

    const printArea = document.getElementById("printArea");
    printArea.style.display = "block";
    
// ... โค้ดส่วนบนคงเดิม ...

    // อัปเดต HTML (เพิ่ม id ให้กับ SVG เพื่อเรียกใช้ง่ายขึ้น)
    printArea.innerHTML = `
        <div id="printableContent" style="width: 100%; text-align: center; padding: 20px; font-family: sans-serif;">
            <div class="preview-title" style="margin-bottom:10px;">👀 ตรวจสอบภาพก่อนพิมพ์</div>
            <img src="${highResImg}" style="width: 90%; max-width: 250px; border: 1px solid #ccc; display: block; margin: 0 auto;">
            <div style="margin-top: 15px;">
                <svg id="newBarcodeSvg"></svg>
            </div>
            <div class="preview-hint" style="margin-top: 10px; font-size: 12px; color: #666;">(นำไปแปะที่เคาน์เตอร์คิดเงิน)</div>
        </div>
    `;

    // ใช้ setTimeout ครอบ JsBarcode เล็กน้อยเพื่อให้แน่ใจว่า DOM ใน printArea ถูกสร้างเสร็จแล้ว
    if (typeof JsBarcode !== 'undefined') {
        setTimeout(() => {
            JsBarcode("#newBarcodeSvg", randomCode, {
                format: "CODE128", 
                width: 2.5, 
                height: 60, 
                displayValue: true, 
                fontSize: 20, 
                margin: 10
            });
        }, 100); // รอ 100ms ให้ browser วาด HTML ให้เสร็จ
    }

    // ... โค้ดส่วนล่างคงเดิม ...

    html5QrcodeScanner.pause();
    showStatus("รอการยืนยันพิมพ์...");
    speakText("ตรวจสอบรูปภาพ ถ้าชัดเจนแล้วกดพิมพ์ได้เลยครับ");

    const btnNew = document.getElementById("btnNewBarcode");
    btnNew.innerHTML = "🖨️ พิมพ์";
    btnNew.style.background = "#e67e22";
    btnNew.onclick = executePrint;

    const btnCancel = document.getElementById("btnCancelBtn");
    btnCancel.innerHTML = "❌ ยกเลิก";
    btnCancel.onclick = cancelPreview;
}

function executePrint(event) {
    if(event) event.stopPropagation();
    showStatus("กำลังสั่งพิมพ์...");

    // แค่สั่งพิมพ์เลยครับ ไม่ต้องย้าย HTML แล้ว
    // เพราะ CSS @media print ด้านบนจะจัดการซ่อนตัวอื่นให้เราอัตโนมัติ
    setTimeout(() => {
        window.print();
        
        // รอให้พ้นหน้าต่าง Print Preview แล้วค่อยซ่อน printArea กลับ
        setTimeout(() => {
            document.getElementById("printArea").style.display = "none";
        }, 1000);
    }, 500);
}

function cancelPreview(event, isSilent = false) {
    if(event) event.stopPropagation();
    const printArea = document.getElementById("printArea");
    if (printArea.style.display === "block") {
        printArea.style.display = "none";
        printArea.innerHTML = "";
        const btnNew = document.getElementById("btnNewBarcode");
        btnNew.innerHTML = "📸 ถ่าย";
        btnNew.style.background = "#9b59b6";
        btnNew.onclick = showBarcodePreview;
        const btnCancel = document.getElementById("btnCancelBtn");
        btnCancel.innerHTML = "ยกเลิก";
        btnCancel.onclick = cancelBasket;
        if (isScanning && typeof html5QrcodeScanner !== 'undefined') {
            html5QrcodeScanner.resume();
        }
        if (!isSilent) showStatus("✅ พร้อมสแกนต่อ");
    }
}

async function handleMenuAction(action) {
    if (!action) return;
    document.getElementById("reportMenu").selectedIndex = 0; 
    
    if (action === 'force-sync') {
        await loadSheetData(); 
    } else if (action === 'print-cart') {
        printCartReceipt();
    } else if (action.startsWith('print-')) {
        showStatus("กำลังดึงข้อมูลจากชีตเพื่อพิมพ์...");
        speakText("กำลังประมวลผลข้อมูลการพิมพ์");
        try {
            let res = await fetch(`${GOOGLE_SCRIPT_URL}?mode=GET_PRINT_DATA&type=${action}`);
            let result = await res.json();
            if (result.status === 'success') {
                document.getElementById("printArea").innerHTML = result.html;
                window.print();
                showStatus("พร้อมพิมพ์");
                setTimeout(() => document.getElementById("printArea").innerHTML = "", 1000); 
            }
        } catch(err) { showStatus("ดึงข้อมูลล้มเหลว"); }
    } else if (action.startsWith('tg-')) {
        showStatus("กำลังส่งข้อมูลเข้า Telegram...");
        speakText("สั่งส่งข้อมูลเข้าเทเลแกรมแล้ว");
        if(navigator.onLine) {
            fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: action })
            });
        } else {
            showStatus("ออฟไลน์: ไม่สามารถส่ง Telegram ได้");
        }
    }
}

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
function sleepScanner(){if(isScanning){html5QrcodeScanner.clear().then(()=>{isScanning=false;document.getElementById('sleepOverlay').style.display='flex';showStatus("💤 พักสแกนเนอร์")})}}

function wakeScanner(){
    if(!isScanning){
        isScanning=true;
        document.getElementById('sleepOverlay').style.display='none';
        showStatus("📷 พร้อมสแกน");
        html5QrcodeScanner.render(onScanSuccess);
        resetIdleTimer();
    }
    if('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

setInterval(()=>{
    const n=new Date();
    const dateStr = n.toLocaleDateString('th-TH',{weekday:'short', day:'numeric', month:'short', year:'numeric'});
    const timeStr = n.toLocaleTimeString('th-TH',{hour:'2-digit', minute:'2-digit', second:'2-digit'});
    document.getElementById('clock').innerText = dateStr + ' ' + timeStr;
    document.getElementById('versionTag').innerText = APP_VERSION;
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

function renderItem(i){
    let l=document.createElement("li");l.className="item-row";
    let st=(parseFloat(i.cost)>0)?"cost-filled":"cost-empty";
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let costClass = (mode === 'SELL') ? 'hidden-cost' : 'visible-cost';
    
    l.innerHTML=`<img src="${i.img}"><span class="barcode-text">${i.code}</span>
    <input type="number" class="item-input" value="${i.qty}" onfocus="this.select()" onchange="changeQty('${i.code}', this.value)">
    <input type="number" class="item-input" value="${i.price}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','price',this.value)">
    <input type="number" class="item-input cost-input ${costClass} ${st}" value="${i.cost}" onfocus="this.select()" onclick="toggleCostVisibility(this)" onchange="updateLocalItem('${i.code}','cost',this.value)">
    <input type="number" class="item-input" value="${i.stock}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','stock',this.value)">
    <input type="text" class="item-input" maxlength="1" value="${(i.supplier||'').toString().substring(0,1)}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','supplier',this.value)">
    <button class="btn-delete" onclick="removeItem('${i.code}')">X</button>`;
    document.getElementById("itemList").appendChild(l);
}

function toggleCostVisibility(el){el.classList.toggle('hidden-cost');el.classList.toggle('visible-cost')}

async function onScanSuccess(d){
    new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    if(groupedItems[d]){ 
        await changeQty(d, parseInt(groupedItems[d].qty) + 1);
    } else { 
        let product = await db.products.get(d); 
        let p = product ? product.price : 0;
        let c = product ? product.cost : 0;
        let s = product ? product.stock : 0;
        let sup = product ? product.supplier : '';

        groupedItems[d] = {code:d, img:takeSnapshot(), qty:1, price: p, cost: c, stock: s, supplier: sup}; 
        
        if (product) {
            if (mode === 'SELL') product.stock = parseInt(product.stock || 0) - 1;
            else if (mode === 'BUY') product.stock = parseInt(product.stock || 0) + 1;
            await db.products.put(product);
            groupedItems[d].stock = product.stock;
        }
        refreshList(); calculateTotal(); 
    }

    if (mode === 'SELL') {
        let currentStock = parseInt(groupedItems[d].stock) || 0;
        if (currentStock <= 5) {
            speakText("สินค้านี้ใกล้หมดครับ เหลือ " + currentStock + " ชิ้น");
        }
    }

    setTimeout(() => {
        const listItems = document.getElementById("itemList").getElementsByClassName("item-row");
        for (let item of listItems) {
            if (item.querySelector('.barcode-text').innerText === d) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                item.style.backgroundColor = "rgba(241, 196, 15, 0.3)";
                setTimeout(() => item.style.backgroundColor = "", 500);
                break;
            }
        }
    }, 100);
    
    html5QrcodeScanner.pause(); 
    showStatus("✅ เพิ่มลงตะกร้าแล้ว"); 
    setTimeout(()=>{if(isScanning)html5QrcodeScanner.resume()},1500);
}

function takeSnapshot(){ 
    const v=document.getElementsByTagName('video')[0], c=document.createElement('canvas'); 
    if(v && v.videoWidth > 0){
        c.width=100; c.height=100; 
        c.getContext('2d').drawImage(v,0,0,100,100);
        return c.toDataURL('image/jpeg',0.5)
    } return "" 
}

async function createCollage(items) {
    if (items.length === 0) return ""; 
    const THUMB_SIZE = 100;
    let cols = 4; let rows = Math.ceil(items.length / cols);
    let canvas = document.createElement('canvas');
    canvas.width = cols * THUMB_SIZE; canvas.height = rows * THUMB_SIZE;
    let ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const loadImage = (src) => new Promise((resolve) => {
        let img = new Image(); img.onload = () => resolve(img); img.src = src;
    });

    for (let i = 0; i < items.length; i++) {
        if (items[i].img) {
            let img = await loadImage(items[i].img);
            let x = (i % cols) * THUMB_SIZE;
            let y = Math.floor(i / cols) * THUMB_SIZE;
            ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);
        }
    }
    return canvas.toDataURL('image/jpeg', 0.6); 
}

async function finishSale() { 
    if(Object.keys(groupedItems).length === 0) return showStatus("ยังไม่มีสินค้าในตะกร้า!"); 
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let totalToSpeak = calculateTotal();
    if (mode === 'SELL' || mode === 'BUY') speakText(totalToSpeak + " บาท ขอบคุณค่ะ");

    let allItems = Object.values(groupedItems);
    let itemsToSync = allItems.map(i => {
        return { code: i.code, qty: i.qty, price: i.price, cost: i.cost, supplier: i.supplier, stock: i.stock };
    });
    let batch1 = allItems.slice(0, 16); let batch2 = allItems.slice(16, 32);
    
    let collage1 = await createCollage(batch1); 
    let collage2 = await createCollage(batch2);

    let billData = { mode: mode, items: itemsToSync, collage1: collage1, collage2: collage2, timestamp: Date.now() };

    groupedItems = {}; refreshList(); calculateTotal();
    
    await db.pendingSales.add(billData);
    syncPendingSales();
}

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
            let res = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bill)
            });
            
            await db.pendingSales.delete(bill.id);
            
        } catch(err) {
            console.error("Sync failed for bill:", bill.id);
            break; 
        }
    }
    
    pendingCount = await db.pendingSales.count();
    if(pendingCount === 0) {
        badge.style.display = 'none';
        showStatus("✅ ซิงค์ข้อมูลครบแล้ว!");
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
    let m = localStorage.getItem('zenMode') || 'SELL'; 
    document.getElementById('modeSelect').value = m; 
    applyModeColor(m);
    
    await loadSheetData(); 
    syncPendingSales(); 

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