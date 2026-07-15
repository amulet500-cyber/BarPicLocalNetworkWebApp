/**
 * Shop System - v.5.01
 * อัปเดต: ปรับปรุงการจัดการ Error ในฟังก์ชันสื่อสารกับ Google Script
 * และจัดการสถานะการสแกนให้แม่นยำขึ้น + เพิ่มปุ่มสลับเต็มจอขนาดเล็กใต้นาฬิกา
 */

const APP_VERSION = "v.5.01"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyEihh74c75U_dnHvrWhCM801b3f78p10ltJrrdZLhkn81Sl3qyb78LoQyq6zQ4FfPZ/exec";

// Initializing Database
const db = new Dexie("ShopDatabase");
db.version(1).stores({
    products: 'code, price, cost, stock, supplier',
    pendingSales: '++id, mode, items, collage1, collage2, timestamp'
});

// Global Variables
let groupedItems = {}, html5QrcodeScanner, idleTimer, isScanning = true;
let currentSpeech = null;
let isProcessing = false;
let previewTimer = null;

const emojiList = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '☺️', '🙂', '🤗', '🤩', '😌', '😛', '😜', '😝', '🤤', '😇', '🥳', '🤠'];

// --- UI Helpers ---
function updateBarcodeTitle() {
    const titleElement = document.querySelector('#cart h3');
    if (titleElement) {
        const emoji1 = emojiList[Math.floor(Math.random() * emojiList.length)];
        const emoji2 = emojiList[Math.floor(Math.random() * emojiList.length)];
        titleElement.innerHTML = `${emoji1}บาร์โค้ด สินค้า${emoji2}`;
    }
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        var msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'th-TH';
        msg.rate = 1.0; 
        window.speechSynthesis.speak(msg);
    }
}

// 🌟 ฟังก์ชันสลับโหมด เต็มจอ / หน้าจอปกติ (Fullscreen Toggle)
function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// 🌟 ฟังก์ชันสร้างปุ่มย่อขยายเต็มจอขนาดเล็ก ไว้ใต้ตำแหน่งนาฬิกาขวาบน
function initSmallFullScreenButton() {
    // ป้องกันการสร้างซ้ำถ้ามีปุ่มเดิมอยู่แล้ว
    if (document.getElementById('btn-fullscreen-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-fullscreen-toggle';
    btn.innerHTML = '⛶ เต็มจอ';
    
    // ตั้งค่า Style ให้เป็นปุ่มเล็กๆ กะทัดรัด ลอยอยู่ใต้มุมขวาของแถบเขียว
    btn.style.position = 'fixed';
    btn.style.top = '52px'; // ระยะดิ่งลงมาจากขอบบน ให้พ้นแนวแถบเมนูสีเขียวพอดี
    btn.style.right = '10px'; // ชิดขวาใต้นาฬิกา
    btn.style.padding = '4px 10px';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = 'bold';
    btn.style.backgroundColor = 'rgba(0, 0, 0, 0.65)'; // ดำโปร่งแสงเนียนๆ
    btn.style.color = '#ffffff';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.4)';
    btn.style.borderRadius = '6px';
    btn.style.zIndex = '99999';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    btn.style.transition = 'all 0.2s ease';
    
    // ฟังก์ชันอัปเดตข้อความและสีบนปุ่มตามสถานะจริงของหน้าจอ
    const updateBtnState = () => {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            btn.innerHTML = '⛶ ย่อจอ';
            btn.style.backgroundColor = 'rgba(192, 57, 43, 0.8)'; // เปลี่ยนเป็นสีแดงตอนเต็มจอ เผื่ออยากกดออก
        } else {
            btn.innerHTML = '⛶ เต็มจอ';
            btn.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
        }
    };

    // ดักจับ Event เมื่อกดปุ่ม
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullScreen();
    });

    // ดักจับสถานะจากระบบ เผื่อศิษย์พี่กดปุ่ม Back หรือกด Exit จากแป้นพิมพ์ ข้อความปุ่มจะได้เปลี่ยนตามอัตโนมัติ
    document.addEventListener('fullscreenchange', updateBtnState);
    document.addEventListener('webkitfullscreenchange', updateBtnState);
    document.addEventListener('msfullscreenchange', updateBtnState);

    document.body.appendChild(btn);
}

// --- Input Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // 🌟 เรียกใช้งานปุ่มเต็มจอจิ๋วทันทีที่หน้าเว็บพร้อมใช้งาน
    initSmallFullScreenButton();

    const inputField = document.getElementById("manualBarcode");
    
    if (inputField) {
        let timeout = null;
        inputField.addEventListener("input", () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const code = inputField.value.trim();
                if (code.length >= 6) {
                    searchAndAddProduct(code);
                    inputField.value = "";
                }
            }, 300);
        });

        inputField.addEventListener("keyup", (event) => {
            if (event.key === "Enter") {
                const code = inputField.value.trim();
                if (code.length > 0) {
                    searchAndAddProduct(code);
                    inputField.value = "";
                }
            }
        });
    }
});

async function searchAndAddProduct(partialCode) {
    try {
        let allProducts = await db.products.toArray();
        let found = allProducts.filter(p => p.code && p.code.toString().endsWith(partialCode));
        
        if (found.length === 1) {
            onScanSuccess(found[0].code);
        } else if (found.length > 1) {
            showStatus("⚠️ พบ " + found.length + " รายการที่ลงท้ายด้วย '" + partialCode + "'");
            console.table(found); 
        } else {
            showStatus("❌ ไม่พบสินค้าที่ลงท้ายด้วย " + partialCode);
        }
    } catch (err) {
        showStatus("❌ เกิดข้อผิดพลาดในการค้นหา");
    }
}

// --- Mode Management ---
function applyModeColor(mode){
    const header = document.getElementById('headerBar');
    const btn = document.getElementById('btnFinish');
    const btnNewBarcode = document.getElementById('btnNewBarcode');
    const colors = {'SELL':'#27ae60', 'BUY':'#f1c40f', 'CHECK':'#3498db'};
    
    if(header) header.style.backgroundColor = colors[mode] || '#27ae60';
    if(btn) btn.style.backgroundColor = colors[mode] || '#27ae60';
    if(btnNewBarcode) btnNewBarcode.style.display = (mode === 'CHECK') ? 'block' : 'none';
    
    cancelPreview();
}

function changeMode(m) {
    localStorage.setItem('zenMode', m);
    applyModeColor(m);

    const modeLabels = {
        'SELL': 'ขายสินค้า',
        'BUY': 'รับเข้า',
        'CHECK': 'เช็คสต๊อก'
    };
    const displayName = modeLabels[m] || m;

    showStatus("โหมด: " + displayName);

    if (typeof speakText === 'function') {
        speakText("โหมด " + displayName);
    }

    if (typeof calculateTotal === 'function') calculateTotal();
    if (typeof refreshList === 'function') refreshList();
    if (typeof updateCameraButton === 'function') updateCameraButton();
}

// --- Camera & Preview Logic ---
function updateCameraButton() {
    const currentMode = localStorage.getItem('zenMode') || 'SELL'; 
    if (currentMode !== 'CHECK') return; 
    
    const btn = document.getElementById("btnNewBarcode") || document.getElementById("btnPurple"); 
    if (!btn) return; 

    const hasItems = (typeof groupedItems !== 'undefined' && Object.keys(groupedItems).length > 0); 
    
    if (hasItems) { 
        btn.style.backgroundColor = "#3498db";
        btn.innerHTML = "📸🖼️📂";
        btn.onclick = () => { 
            new Audio('https://actions.google.com/sounds/v1/camera/camera_shutter_click.ogg').play(); 
            const flash = document.getElementById('flash-overlay'); 
            if (flash) { flash.style.opacity = 1; setTimeout(() => flash.style.opacity = 0, 100); }
            if (typeof onPurpleCameraBtnClick === 'function') onPurpleCameraBtnClick();
        };
    } else {
        btn.style.backgroundColor = "#8e44ad";
        btn.innerHTML = "📷🖼️🖨️";
        btn.onclick = () => { 
            speakText("ตรวจสอบภาพและบาร์โค้ดก่อนพิมพ์ครับ");
            if (typeof onPurpleCameraBtnClick === 'function') onPurpleCameraBtnClick();
        };
    }
}

function onPurpleCameraBtnClick(event) {
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

function showBarcodePreview(event) {
    if(event) event.stopPropagation();
    const v = document.getElementsByTagName('video')[0];
    if (!v || v.videoWidth === 0) return showStatus("⚠️ ไม่พบกล้อง");
    
    const c = document.createElement('canvas'); 
    c.width = 400; c.height = 550; 
    const ctx = c.getContext('2d');
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    
    const size = Math.min(v.videoWidth, v.videoHeight); 
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 400, 400);
    
    const randomCode = "99" + Math.floor(10000000000 + Math.random() * 90000000000).toString().substring(0, 11); 
    const bc = document.createElement('canvas'); 
    if (typeof JsBarcode !== 'undefined') {
        JsBarcode(bc, randomCode, { format: "CODE128", width: 2, height: 80, fontSize: 20, background: "#ffffff", lineColor: "#000000" });
        ctx.drawImage(bc, (400 - bc.width) / 2, 410); 
    }
    
    const finalImg = c.toDataURL('image/jpeg', 0.8);
    const printArea = document.getElementById("printArea");
    if(printArea) {
        printArea.style.display = "block";
        printArea.innerHTML = `<div style="text-align:center; padding:20px;"><img src="${finalImg}" style="width:300px; border:1px solid #ccc;"></div>`;
    }
    
    showStatus("รอการยืนยันพิมพ์...");
    const btnNew = document.getElementById("btnNewBarcode");
    if(btnNew) {
        btnNew.innerHTML = "🖨️ พิมพ์";
        btnNew.onclick = executePrint;
    }
}

function executePrint(event) {
    if(event) event.stopPropagation();
    window.print();
    setTimeout(() => {
        const printArea = document.getElementById("printArea");
        if(printArea) printArea.style.display = "none";
        resetButtonToCameraMode();
    }, 1000);
}

// --- Sync & Storage ---
function cancelPreview(event) {
    if(event) event.stopPropagation();
    const printArea = document.getElementById("printArea");
    if(printArea) printArea.style.display = "none";
    resetButtonToCameraMode();
}

function resetButtonToCameraMode() {
    updateCameraButton(); 
}

function captureAndSaveToDrive(event, barcodeText) {
    const flash = document.getElementById('flash-overlay'); 
    if (flash) { flash.style.opacity = 1; setTimeout(() => flash.style.opacity = 0, 100); }
    new Audio('https://actions.google.com/sounds/v1/camera/camera_shutter_click.ogg').play(); 
    
    if(event) event.stopPropagation(); 
    const v = document.getElementsByTagName('video')[0];
    if (!v || v.videoWidth === 0) return showStatus("⚠️ ไม่พบกล้อง");
    
    showStatus("กำลังรวมรูปและส่งเข้า Google Drive...");
    const c = document.createElement('canvas'); 
    c.width = 400; c.height = 550; 
    const ctx = c.getContext('2d');
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    
    const size = Math.min(v.videoWidth, v.videoHeight); 
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 400, 400);
    
    const bc = document.createElement('canvas'); 
    if (typeof JsBarcode !== 'undefined') {
        JsBarcode(bc, barcodeText, { format: "CODE128", width: 2, height: 80, fontSize: 20, background: "#ffffff", lineColor: "#000000" });
        ctx.drawImage(bc, (400 - bc.width) / 2, 410);
    }
    
    const formData = new URLSearchParams();
    formData.append("isImageUpload", "true");
    formData.append("barcode", barcodeText);
    formData.append("image64", c.toDataURL('image/jpeg', 0.8));
    
    fetch(GOOGLE_SCRIPT_URL, { 
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            showStatus("✅ บันทึก " + barcodeText + " เรียบร้อย");
            speakText("บันทึกรูป Google Drive สำเร็จครับ");
        } else {
            showStatus("❌ ผิดพลาด: " + (data.message || ""));
            speakText("บันทึกไม่สำเร็จ");
        }
    })
    .catch(err => {
        showStatus("❌ ส่งข้อมูลไม่สำเร็จ");
        speakText("มีข้อผิดพลาดในการส่งข้อมูล");
    });
}

// --- Main Scan Logic ---
async function onScanSuccess(d) {
    if (isProcessing) return; 
    isProcessing = true; 
    new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
    
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    let snapImg = takeSnapshot(); 

    if(groupedItems[d]){ 
        if (mode !== 'CHECK') {
            await changeQty(d, parseInt(groupedItems[d].qty) + 1);
        }
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

    fetch(GOOGLE_SCRIPT_URL + "?mode=GET_IMAGE_URL&barcode=" + d)
        .then(res => res.text())
        .then(imageUrl => {
            if (imageUrl && imageUrl !== "NOT_FOUND" && imageUrl !== "") {
                if (groupedItems[d]) {
                    groupedItems[d].img = imageUrl;
                    refreshList(); 
                    const overlay = document.getElementById("scan-preview-overlay");
                    const overlayImg = document.getElementById("last-scanned-img");
                    if (overlay && overlay.style.display === "flex" && overlayImg) {
                        overlayImg.src = imageUrl;
                    }
                }
            }
        })
        .catch(err => console.log("Background image fetch skipped:", err));

    const overlay = document.getElementById("scan-preview-overlay");
    const overlayImg = document.getElementById("last-scanned-img");

    if (overlay && overlayImg) {
        if (previewTimer) clearTimeout(previewTimer);
        overlayImg.src = snapImg;
        overlay.style.display = "flex";
        overlay.style.opacity = "1"; 
        
        overlay.onclick = function() {
            overlay.style.opacity = "0";
            setTimeout(() => { overlay.style.display = "none"; }, 500);
            if (previewTimer) clearTimeout(previewTimer);
        };
        
        previewTimer = setTimeout(() => {
            overlay.style.opacity = "0"; 
            setTimeout(() => { overlay.style.display = "none"; }, 1000);
        }, 9000); 
    }

    if (mode === 'SELL') {
        let currentStock = parseInt(groupedItems[d].stock) || 0;
        if (currentStock <= 5) speakText("สินค้านี้ใกล้หมดครับ เหลือ " + currentStock + " ชิ้น");
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

    updateBarcodeTitle();
    html5QrcodeScanner.pause(); 
    
    showStatus(mode === 'CHECK' ? "✅ ตรวจสอบรายการสำเร็จ" : "✅ เพิ่มลงตะกร้าแล้ว"); 
    
    updateCameraButton(); 
    
    setTimeout(() => {
        isProcessing = false; 
        if(isScanning) html5QrcodeScanner.resume();
    }, 800);
}

// --- Menu Actions ---
async function handleMenuAction(action) {
    if (!action) return;
    const menu = document.getElementById("reportMenu");
    if(menu) menu.selectedIndex = 0; 
    
    if (action === 'force-sync') {
        if(typeof loadSheetData === 'function') await loadSheetData(); 
    } else if (action === 'print-cart') {
        if(typeof printCartReceipt === 'function') printCartReceipt();
    } else if (action.startsWith('print-')) {
        showStatus("กำลังดึงข้อมูลจากชีตเพื่อพิมพ์...");
        speakText("กำลังประมวลผลข้อมูลการพิมพ์");
        try {
            let res = await fetch(`${GOOGLE_SCRIPT_URL}?mode=GET_PRINT_DATA&type=${action}`);
            let result = await res.json();
            if (result.status === 'success') {
                const pArea = document.getElementById("printArea");
                if(pArea) {
                    pArea.innerHTML = result.html;
                    window.print();
                    showStatus("พร้อมพิมพ์");
                    setTimeout(() => pArea.innerHTML = "", 1000);
                }
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

function handleMenuSelect(selectElement) {
    const value = selectElement.value;
    if (value === "productData") {
        if (typeof showProductData === 'function') {
            showProductData(); 
        } else {
            console.warn("ยังไม่ได้สร้างฟังก์ชัน showProductData ครับ");
            alert("ฟังก์ชันแสดงข้อมูลสินค้ายังไม่พร้อมใช้งาน");
        }
        const lastMode = localStorage.getItem('zenMode') || 'SELL';
        selectElement.value = lastMode; 
    } else {
        changeMode(value);
    }
}

async function showProductData() {
    const dialog = document.getElementById('productDialog');
    const content = document.getElementById('productContent');
    
    dialog.showModal();
    content.innerHTML = `
        <input type="text" id="searchProduct" placeholder="🔍 ค้นหาบาร์โค้ด ชื่อ หรือร้านส่ง..." 
               style="width:90%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #ccc; font-size: 16px;">
        <div id="tableContainer" style="max-height: 400px; overflow-y: auto;">กำลังโหลดข้อมูล...</div>
    `;
    
    const products = await db.products.toArray();

    const renderTable = (filter = '') => {
        const container = document.getElementById('tableContainer');
        const filtered = products.filter(p => 
            (p.name && p.name.toLowerCase().includes(filter.toLowerCase())) || 
            (p.code && p.code.includes(filter)) ||
            (p.supplier && p.supplier.toLowerCase().includes(filter.toLowerCase()))
        );

        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777;">ไม่พบสินค้า</p>';
            return;
        }

        let html = `
            <table style="width:100%; border-collapse: collapse; font-size: 0.75em;">
                <tr style="background:#f4f4f4; color:#333; position: sticky; top: 0;">
                    <th style="padding:4px;">บาร์โค้ด</th>
                    <th style="padding:4px;">ราคา</th>
                    <th style="padding:4px;">ทุน</th>
                    <th style="padding:4px;">สต็อก</th>
                    <th style="padding:4px;">ร้านส่ง</th>
                </tr>`;
        
        filtered.forEach(p => {
            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:4px;">${p.code || '-'}</td>
                    <td style="padding:4px; text-align:right;">${Number(p.price || 0).toLocaleString()}</td>
                    <td style="padding:4px; text-align:right;">${Number(p.cost || 0).toLocaleString()}</td>
                    <td style="padding:4px; text-align:center;">${p.stock || 0}</td>
                    <td style="padding:4px; text-align:center;">${p.supplier || '-'}</td>
                </tr>`;
        });
        
        html += `</table>`;
        container.innerHTML = html;
    };

    renderTable();

    document.getElementById('searchProduct').addEventListener('input', (e) => {
        renderTable(e.target.value);
    });
}

async function loadProductList() {
    const content = document.getElementById('productContent');
    content.innerHTML = '<p style="text-align:center;">กำลังโหลด...</p>';

    try {
        const products = await db.products.toArray(); 
        
        if (products.length === 0) {
            content.innerHTML = '<p style="text-align:center;">ไม่มีข้อมูลสินค้า</p>';
            return;
        }

        let html = '<table style="width:100%; border-collapse: collapse; font-size: 14px;">';
        html += '<thead><tr style="background:#f2f2f2;"><th>สินค้า</th><th>ราคา</th></tr></thead><tbody>';
        
        products.forEach(p => {
            html += `<tr>
                <td style="padding:8px; border-bottom:1px solid #ddd;">${p.name}</td>
                <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">${p.price}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        content.innerHTML = html;
        
    } catch (err) {
        content.innerHTML = '<p style="text-align:center; color:red;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
        console.error("Dexie Error:", err);
    }
}