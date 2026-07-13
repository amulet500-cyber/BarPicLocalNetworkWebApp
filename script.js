const APP_VERSION = "v.1.06"; // 🌟 อัปเดตเวอร์ชัน
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyEihh74c75U_dnHvrWhCM801b3f78p10ltJrrdZLhkn81Sl3qyb78LoQyq6zQ4FfPZ/exec";
const db = new Dexie("ShopDatabase");
db.version(1).stores({
    products: 'code, price, cost, stock, supplier',
    pendingSales: '++id, mode, items, collage1, collage2, timestamp'
});
let groupedItems={}, html5QrcodeScanner, idleTimer, isScanning=true;
let currentSpeech = null;

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // 1. ยกเลิกเสียงที่พูดค้างอยู่ก่อน
        var msg = new SpeechSynthesisUtterance(text); // 2. ประกาศตัวแปรด้วย var ให้ถูกต้อง (ป้องกันหน้าจอดำจาก error)
        msg.lang = 'th-TH';
        msg.rate = 1.0; 
        window.speechSynthesis.speak(msg); // 3. สั่งพูด
    } else {
        console.warn("เบราว์เซอร์นี้ไม่รองรับระบบเสียงพูดครับ");
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
    updateCameraButton(); // อัปเดตปุ่มเมื่อเปลี่ยนโหมด
}

function updateCameraButton() { // 🌟 1. ฟังก์ชันอัปเดตปุ่มอัจฉริยะ 
    const currentMode = localStorage.getItem('zenMode') || 'SELL'; 
    if (currentMode !== 'CHECK') return; 
    const btn = document.getElementById("btnNewBarcode") || document.getElementById("btnPurple"); 
    if (!btn) {
        console.log("❌ หาปุ่มไม่เจอครับ ศิษย์พี่ต้องเช็ค ID ใน HTML ครับ");
        return; 
    }
    const hasItems = (typeof groupedItems !== 'undefined' && Object.keys(groupedItems).length > 0); 
    if (hasItems) { 
        btn.style.backgroundColor = "#3498db"; // สีฟ้า
        btn.innerHTML = "📸🖼️📂"; // ไอคอนส่ง Drive
        btn.onclick = function() { 
            new Audio('https://actions.google.com/sounds/v1/camera/camera_shutter_click.ogg').play(); 
            const flash = document.getElementById('flash-overlay'); 
            if (flash) {
                flash.style.opacity = 1;
                setTimeout(() => flash.style.opacity = 0, 100);
            }
            if (typeof onPurpleCameraBtnClick === 'function') { 
                onPurpleCameraBtnClick();
            }
        };
    } else {
        btn.style.backgroundColor = "#8e44ad"; // สีม่วง
        btn.innerHTML = "📷🖼️🖨️"; // ไอคอนสร้างบาร์โค้ด
        btn.onclick = function() { 
            if (typeof speakText === 'function') {
                speakText("ตรวจสอบภาพและบาร์โค้ดก่อนพิมพ์ครับ");
            }
            if (typeof onPurpleCameraBtnClick === 'function') { 
                onPurpleCameraBtnClick();
            }
        };
    }
}

function onPurpleCameraBtnClick(event) { // 🌟 2. ฟังก์ชันตัวแยกทางเดิน 
    if(event) event.stopPropagation();
    const currentMode = localStorage.getItem('zenMode') || 'SELL'; 
    if (currentMode !== 'CHECK') return; 
    let currentCartBarcode = "";
    if (typeof groupedItems !== 'undefined' && Object.keys(groupedItems).length > 0) { 
        const keys = Object.keys(groupedItems);
        currentCartBarcode = keys[keys.length - 1]; 
    }
    if (currentCartBarcode === "") { 
        showBarcodePreview(event); 
    } else {
        captureAndSaveToDrive(event, currentCartBarcode); 
    }
}

function showBarcodePreview(event) { // 🌟 3. ฟังก์ชันสร้างและสุ่มบาร์โค้ดเพื่อพิมพ์
    if(event) event.stopPropagation();
    const v = document.getElementsByTagName('video')[0];
    if (!v || v.videoWidth === 0) return showStatus("⚠️ ไม่พบกล้อง");
    const c = document.createElement('canvas'); 
    c.width = 400; 
    c.height = 550; 
    const ctx = c.getContext('2d');
    ctx.fillStyle = "#ffffff"; 
    ctx.fillRect(0, 0, c.width, c.height);
    const size = Math.min(v.videoWidth, v.videoHeight); 
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 400, 400);
    const randomCode = "99" + Math.floor(10000000000 + Math.random() * 90000000000).toString().substring(0, 11); 
    const bc = document.createElement('canvas'); 
    if (typeof JsBarcode !== 'undefined') {
        JsBarcode(bc, randomCode, { 
            format: "CODE128", 
            width: 2, 
            height: 80, 
            fontSize: 20,
            background: "#ffffff",
            lineColor: "#000000"
        });
        ctx.drawImage(bc, (400 - bc.width) / 2, 410); 
    }
    const finalImg = c.toDataURL('image/jpeg', 0.8);
    const printArea = document.getElementById("printArea");
    if(printArea) {
        printArea.style.display = "block";
        printArea.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <img src="${finalImg}" style="width:300px; border:1px solid #ccc;">
            </div>`;
    }
    showStatus("รอการยืนยันพิมพ์...");
    const btnNew = document.getElementById("btnNewBarcode");
    if(btnNew) {
        btnNew.innerHTML = "🖨️ พิมพ์";
        btnNew.onclick = executePrint;
    }
}

function executePrint(event) { // 🌟 4. ฟังก์ชันสั่งพิมพ์
    if(event) event.stopPropagation();
    window.print();
    setTimeout(() => {
        const printArea = document.getElementById("printArea");
        if(printArea) printArea.style.display = "none";
        resetButtonToCameraMode();
    }, 1000);
}

function cancelPreview(event) { // 🌟 5. ฟังก์ชันยกเลิกพิมพ์
    if(event) event.stopPropagation();
    const printArea = document.getElementById("printArea");
    if(printArea) printArea.style.display = "none";
    resetButtonToCameraMode();
}

function resetButtonToCameraMode() { // 🌟 6. ฟังก์ชันคืนค่าปุ่ม
    updateCameraButton(); 
}

function captureAndSaveToDrive(event, barcodeText) { // 🌟 7. ฟังก์ชันถ่ายรูป + ส่ง Drive
    const flash = document.getElementById('flash-overlay'); 
    if (flash) {
        flash.style.opacity = 1; 
        setTimeout(() => flash.style.opacity = 0, 100); 
    }
    new Audio('https://actions.google.com/sounds/v1/camera/camera_shutter_click.ogg').play(); 
    if(event) event.stopPropagation(); 
    const v = document.getElementsByTagName('video')[0];
    if (!v || v.videoWidth === 0) return showStatus("⚠️ ไม่พบกล้อง");
    showStatus("กำลังรวมรูปและส่งเข้า Google Drive...");
    const c = document.createElement('canvas'); 
    c.width = 400; 
    c.height = 550; 
    const ctx = c.getContext('2d');
    ctx.fillStyle = "#ffffff"; 
    ctx.fillRect(0, 0, c.width, c.height);
    const size = Math.min(v.videoWidth, v.videoHeight); 
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 400, 400);
    const bc = document.createElement('canvas'); 
    if (typeof JsBarcode !== 'undefined') {
        JsBarcode(bc, barcodeText, { 
            format: "CODE128", 
            width: 2, 
            height: 80, 
            fontSize: 20,
            background: "#ffffff",
            lineColor: "#000000"
        });
        ctx.drawImage(bc, (400 - bc.width) / 2, 410);
    }
    const formData = new URLSearchParams();
    formData.append("isImageUpload", "true");
    formData.append("barcode", barcodeText);
    formData.append("image64", c.toDataURL('image/jpeg', 0.8));
    const scriptUrl = typeof GOOGLE_SCRIPT_URL !== 'undefined' ? GOOGLE_SCRIPT_URL : "";
    fetch(scriptUrl, { 
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            showStatus("✅ บันทึก " + barcodeText + " เรียบร้อยครับ");
            speakText("บันทึกรูป Google Drive สำเร็จครับ");
        } else {
            showStatus("❌ ผิดพลาด: " + (data.message || ""));
            speakText("บันทึกไม่สำเร็จครับ");
        }
    })
    .catch(err => {
        showStatus("❌ ส่งข้อมูลไม่สำเร็จ");
        speakText("มีข้อผิดพลาดในการส่งข้อมูลครับ");
        console.error(err);
    });
}

let isProcessing = false; // 🌟 เพิ่มตัวแปรนี้ไว้ที่ส่วนต้นของไฟล์ (Global scope)

// เพิ่มตัวแปร global ไว้ด้านบนสุดของไฟล์ script.js ถ้ายังไม่มี
let previewTimer = null; 

async function onScanSuccess(d) {
    if (isProcessing) return; 
    isProcessing = true; 

    new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let snapImg = takeSnapshot(); 

    if(groupedItems[d]){ 
        await changeQty(d, parseInt(groupedItems[d].qty) + 1);
    } else { 
        let product = await db.products.get(d); 
        let p = product ? product.price : 0;
        let c = product ? product.cost : 0;
        let s = product ? product.stock : 0;
        let sup = product ? product.supplier : '';
        groupedItems[d] = {code:d, img:snapImg, qty:1, price: p, cost: c, stock: s, supplier: sup}; 
        if (product) {
            if (mode === 'SELL') product.stock = parseInt(product.stock || 0) - 1;
            else if (mode === 'BUY') product.stock = parseInt(product.stock || 0) + 1;
            await db.products.put(product);
            groupedItems[d].stock = product.stock;
        }
        refreshList(); 
        calculateTotal(); 
    }

    // 🌟 ระบบ Preview แบบใหม่ ปรับปรุงให้คลิกปิดได้และหยุดเวลาอัตโนมัติ
    const overlay = document.getElementById("scan-preview-overlay"); 
    const overlayImg = document.getElementById("last-scanned-img");
    
    if (overlay && overlayImg && snapImg !== "") {
        // ล้างเวลาเก่าทิ้งก่อนเสมอ
        if (previewTimer) clearTimeout(previewTimer);
        
        overlayImg.src = snapImg;
        overlay.style.display = "flex";
        overlay.style.opacity = "1"; 

        // ทำให้คลิกที่รูปแล้วปิดทันที
        overlay.onclick = function() {
            overlay.style.opacity = "0";
            setTimeout(() => { overlay.style.display = "none"; }, 500);
            if (previewTimer) clearTimeout(previewTimer);
        };
        
        // ตั้งเวลาให้ซ่อนเองใน 10 วินาที
        previewTimer = setTimeout(() => {
            overlay.style.opacity = "0"; 
            setTimeout(() => { overlay.style.display = "none"; }, 1000);
        }, 9000); 
    }

    if (mode === 'SELL') {
        let currentStock = parseInt(groupedItems[d].stock) || 0;
        if (currentStock <= 5) {
            speakText("สินค้านี้ใกล้หมดครับ เหลือ " + currentStock + " ชิ้น");
        }
    }

    // Highlight รายการ
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
    updateCameraButton(); 

    setTimeout(() => {
        isProcessing = false; 
        if(isScanning) html5QrcodeScanner.resume();
    }, 600); //หน่วงพัก 600 มิลลิวินาที (0.6 วินาที) จะทำให้ระบบตอบสนองไวขึ้นมาก
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

// 🌟 เพิ่มฟังก์ชันโชว์รูปภาพเมื่อคลิกที่ Thumbnail
function showImagePreview(code) { 
    const overlay = document.getElementById("scan-preview-overlay");
    const overlayImg = document.getElementById("last-scanned-img");
    
    if (overlay && overlayImg && groupedItems[code] && groupedItems[code].img) {
        overlayImg.src = groupedItems[code].img;
        overlay.style.display = "block"; 
        
        // แตะที่รูปเพื่อปิด หรือปล่อยไว้ 3 วินาทีจะปิดเอง
        overlay.onclick = function() { overlay.style.display = "none"; };
        setTimeout(() => { overlay.style.display = "none"; }, 3000);
    }
}

function renderItem(i) {
    let l = document.createElement("li");
    l.className = "item-row";
    let st = (parseFloat(i.cost) > 0) ? "cost-filled" : "cost-empty";
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let costClass = (mode === 'SELL') ? 'hidden-cost' : 'visible-cost';

    // 🌟 อัพเดท onclick ให้เรียกฟังก์ชันดึงรูปโดยตรง เพื่อให้เปิดพรีวิวได้ทันที
    // เราใช้การ Escape สตริงเพื่อให้ส่งค่า URL ของรูปภาพได้ถูกต้องครับ
    l.innerHTML = `<img src="${i.img}" onclick="openImageFromCart('${i.img}')" style="cursor: pointer;">
    <span class="barcode-text">${i.code}</span>
    <input type="number" class="item-input" value="${i.qty}" onfocus="this.select()" onchange="changeQty('${i.code}', this.value)">
    <input type="number" class="item-input" value="${i.price}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','price',this.value)">
    <input type="number" class="item-input cost-input ${costClass} ${st}" value="${i.cost}" onfocus="this.select()" onclick="toggleCostVisibility(this)" onchange="updateLocalItem('${i.code}','cost',this.value)">
    <input type="number" class="item-input" value="${i.stock}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','stock',this.value)">
    <input type="text" class="item-input" maxlength="1" value="${(i.supplier || '').toString().substring(0, 1)}" onfocus="this.select()" onchange="updateLocalItem('${i.code}','supplier',this.value)">
    <button class="btn-delete" onclick="removeItem('${i.code}')">X</button>`;

    document.getElementById("itemList").appendChild(l);
}

function toggleCostVisibility(el){el.classList.toggle('hidden-cost');el.classList.toggle('visible-cost')}

function takeSnapshot(width = 500, height = 500){ // 🌟 ปรับขนาดเป็น 500x500 เพื่อความคมชัด
    const v = document.getElementsByTagName('video')[0], 
          c = document.createElement('canvas'); 
    if(v && v.videoWidth > 0){
        c.width = width; 
        c.height = height;
        c.getContext('2d').drawImage(v, 0, 0, width, height);
        return c.toDataURL('image/jpeg', 0.9); // 🌟 ปรับคุณภาพเป็น 0.9 เพื่อให้ชัดยิ่งขึ้น
    } 
    return ""; 
}

async function createCollage(items) {
    if (items.length === 0) return ""; 
    const THUMB_SIZE = 100; // 🌟 รูป 500x500 จะถูกย่อเหลือ 100x100 ตรงนี้ ทำให้ส่งเข้า Telegram ได้รวดเร็วเท่าเดิม!
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

// ตัวแปรควบคุม
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
        currentReceived = 0; // รีเซ็ตเงินเมื่อปิดหน้าต่าง
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
    // 1. ตรวจสอบยอดเงิน
    if (currentReceived < currentTotal) {
        alert("เงินยังไม่ครบครับ!");
        return;
    }
    
    let change = currentReceived - currentTotal;
    
    // 2. แสดงผลเงินทอนบนหน้าจอ
    document.getElementById("changeDisplay").innerText = change;
    
    // 3. ปิดพาเนล
    document.getElementById('paymentPanel').style.display = 'none';
    
    // 4. ส่งค่าเงินทอน และ จำนวนเงินที่รับมา ไปให้ finishSale พูดสรุปทีเดียว
    await finishSale(change, currentReceived); 
}

async function finishSale(change = 0, received = 0) { 
    // 1. ตรวจสอบสินค้าในตะกร้า
    if(Object.keys(groupedItems).length === 0) return showStatus("ยังไม่มีสินค้าในตะกร้า!"); 
    
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    // 2. แจ้งเสียงตามโหมด (ปรับปรุงให้พูด ยอดรวม, รับเงิน, ทอน ครบถ้วน)
    if (mode === 'SELL') {
        let speechMessage = `ยอดรวม ${currentTotal} บาท `;
        speechMessage += `รับเงิน ${received} บาท `;
        if (change > 0) speechMessage += `ทอน ${change} บาท `;
        speechMessage += `ขอบคุณครับ`;
        speakText(speechMessage);
    } else if (mode === 'BUY') {
        speakText(currentTotal + " บาท ขอบคุณครับ");
    }
    
    let allItems = Object.values(groupedItems);
    let itemsToSync = allItems.map(i => {
        return { code: i.code, qty: i.qty, price: i.price, cost: i.cost, supplier: i.supplier, stock: i.stock };
    });
    
    // 3. สร้าง Collage (คงความสามารถเดิม)
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
        received: currentReceived,
        change: change,
        timestamp: Date.now() 
    };
    
    try {
        // 4. บันทึกลงฐานข้อมูล
        await db.pendingSales.add(billData);
        
        // 5. เมื่อบันทึกสำเร็จแล้ว จึงค่อยล้างตะกร้าและอัปเดตหน้าจอ
        groupedItems = {}; 
        refreshList(); 
        calculateTotal(); 
        updateCameraButton();
        
        // 6. สั่งซิงค์ข้อมูล (เทเลแกรมและอื่นๆ ยังอยู่ครบถ้วนในฟังก์ชันนี้)
        syncPendingSales();
        showStatus("✅ บันทึกการขายเรียบร้อย");
    } catch (error) {
        console.error("บันทึกข้อมูลไม่สำเร็จ:", error);
        showStatus("❌ บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    }
}

function openPaymentPanel() {
    // 1. ดึงยอดรวมจากระบบเดิมของศิษย์พี่ (สมมติว่าตัวแปรยอดรวมคือ totalAmount)
    // หากศิษย์พี่ใช้ฟังก์ชันคำนวณยอดรวมชื่ออื่น ให้เปลี่ยนในบรรทัดนี้ได้เลยครับ
    let total = calculateTotal(); // ลองเปลี่ยนชื่อฟังก์ชันนี้ให้ตรงกับที่ระบบเดิมใช้
    
    // 2. ถ้าดึงค่าได้ ให้สั่งเปิดพาเนล
    if (total > 0) {
        togglePayment(true, total);
    } else {
        alert("ยังไม่มีสินค้าในตะกร้าครับ");
    }
}

function openImageFromCart(imgSrc) {
    const overlay = document.getElementById("scan-preview-overlay");
    const overlayImg = document.getElementById("last-scanned-img");
    
    if (overlay && overlayImg) {
        overlayImg.src = imgSrc;
        overlay.style.display = "flex"; // ล้างเวลา timeout เก่าที่อาจจะค้างอยู่ (ถ้ามี)
        overlay.style.opacity = "1";// ถ้าศิษย์พี่กดเปิดเอง เราอาจจะไม่ต้องตั้งเวลาปิด หรือตั้งใหม่ได้ครับ
              
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