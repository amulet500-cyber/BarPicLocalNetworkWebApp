/**
 * Shop System - v.5.23 (Optimized Google Apps Script Cloud Edition)
 */

const APP_VERSION = "v.5.23"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyEihh74c75U_dnHvrWhCM801b3f78p10ltJrrdZLhkn81Sl3qyb78LoQyq6zQ4FfPZ/exec";

// Initializing Database
const db = new Dexie("ShopDatabase");
db.version(1).stores({
    products: 'code, price, cost, stock, supplier',
    pendingSales: '++id, mode, items, collage1, collage2, timestamp, deviceName'
});

// Global Variables
let groupedItems = {}, html5QrcodeScanner, idleTimer, isScanning = true;
let currentSpeech = null;
let isProcessing = false;
let previewTimer = null;
let lastScannedCode = "";
let lastScannedTime = 0;

const emojiList = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '☺️', '🙂', '🤗', '🤩', '😌', '😛', '😜', '😝', '🤤', '😇', '🥳', '🤠'];

// --- Helper อ่านและบันทึกชื่อเครื่อง ---
function getDeviceName() {
    const inputEl = document.getElementById('deviceNameInput');
    let name = inputEl ? inputEl.value.trim() : '';
    if (name) {
        localStorage.setItem('deviceName', name);
    } else {
        name = localStorage.getItem('deviceName') || 'ไม่ได้ตั้งชื่อ';
    }
    return name;
}

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
        msg.rate = 1.1; 
        window.speechSynthesis.speak(msg);
    }
}

function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        let elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
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

function initSmallFullScreenButton() {
    if (document.getElementById('btn-fullscreen-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-fullscreen-toggle';
    btn.innerHTML = '⛶ เต็มจอ';
    
    btn.style.position = 'fixed';
    btn.style.top = '70px';
    btn.style.right = '10px'; 
    btn.style.padding = '4px 10px';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = 'bold';
    btn.style.backgroundColor = 'rgba(0, 0, 0, 0.65)'; 
    btn.style.color = '#ffffff';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.4)';
    btn.style.borderRadius = '6px';
    btn.style.zIndex = '99999';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    btn.style.transition = 'all 0.2s ease';
    
    const updateBtnState = () => {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
            btn.innerHTML = '⛶ ย่อจอ';
            btn.style.backgroundColor = 'rgba(192, 57, 43, 0.8)'; 
        } else {
            btn.innerHTML = '⛶ เต็มจอ';
            btn.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
        }
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullScreen();
    });

    document.addEventListener('fullscreenchange', updateBtnState);
    document.addEventListener('webkitfullscreenchange', updateBtnState);
    document.addEventListener('msfullscreenchange', updateBtnState);

    document.body.appendChild(btn);
}

// --- Input Logic ---
document.addEventListener('DOMContentLoaded', () => {
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
            speakText("สินค้าใหม่ บาร์โค้ดนี้ยังไม่มีข้อมูลค่ะ");
            onScanSuccess(partialCode);
        }
        allProducts = null;
        found = null;
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

    const modeLabels = { 'SELL': 'ขายสินค้า', 'BUY': 'รับเข้า', 'CHECK': 'เช็คสต๊อก' };
    const displayName = modeLabels[m] || m;
    showStatus("โหมด: " + displayName);
    speakText("โหมด " + displayName);

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
    
    html5QrcodeScanner.pause(); 

    let mode = localStorage.getItem('zenMode') || 'SELL';
    let snapImg = takeSnapshot(); 
    
    let product = await db.products.get(d);
    let isExistingProduct = (!!product) || (groupedItems[d] !== undefined);
    let resumeDelay = 800; 

    if (isExistingProduct) {
        if (groupedItems[d]) {
            resumeDelay = 1200; 
            new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
            
            if (mode !== 'CHECK') {
                await changeQty(d, parseInt(groupedItems[d].qty) + 1);
            }
        } else {
            resumeDelay = 800; 
            new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
            
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
        showStatus(mode === 'CHECK' ? "✅ ตรวจสอบรายการสำเร็จ" : "✅ เพิ่มลงตะกร้าแล้ว");
    } else {
        resumeDelay = 2000; 
        speakText("สินค้าใหม่ บาร์โค้ดนี้ยังไม่มีข้อมูลค่ะ");
        
        groupedItems[d] = {code:d, img:snapImg, qty:1, price: 0, cost: 0, stock: 0, supplier: ''};
        await db.products.put({code:d, price: 0, cost: 0, stock: 0, supplier: ''});
        
        refreshList();
        calculateTotal();
        showStatus("✨ พบสินค้าใหม่! กรุณากรอกข้อมูล");
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

    if (mode === 'SELL' && product) {
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
    updateCameraButton(); 
    
    setTimeout(() => {
        isProcessing = false; 
        if(isScanning) html5QrcodeScanner.resume();
    }, resumeDelay);
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
            let currentDevice = getDeviceName(); 
            fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: action, deviceName: currentDevice })
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
        <input type="text" id="searchProduct" placeholder="🔍 ค้นหาบาร์โค้ด หรือร้านส่ง..." 
               style="width:90%; padding:10px; margin-bottom:10px; border-radius:8px; border:1px solid #ccc; font-size: 16px;">
        <div id="tableContainer" style="max-height: 400px; overflow-y: auto;">กำลังโหลดข้อมูล...</div>
    `;
    
    const products = await db.products.toArray();
    let filteredProducts = [...products];
    let displayCount = 50; 

    const appendRows = (start, end) => {
        const table = document.getElementById('productDataTable');
        if (!table) return;
        
        let html = '';
        const chunk = filteredProducts.slice(start, end);
        chunk.forEach(p => {
            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:6px; font-weight:bold;">${p.code || '-'}</td>
                    <td style="padding:6px; text-align:right; color:#27ae60;">${Number(p.price || 0).toLocaleString()}</td>
                    <td style="padding:6px; text-align:right; color:#e74c3c;">${Number(p.cost || 0).toLocaleString()}</td>
                    <td style="padding:6px; text-align:center;">${p.stock || 0}</td>
                    <td style="padding:6px; text-align:center; background:#f9f9f9;">${p.supplier || '-'}</td>
                </tr>`;
        });
        table.insertAdjacentHTML('beforeend', html);
    };

    const initTable = () => {
        const container = document.getElementById('tableContainer');
        if (filteredProducts.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#777;">ไม่พบรายการสินค้า</p>';
            return;
        }

        container.innerHTML = `
            <table id="productDataTable" style="width:100%; border-collapse: collapse; font-size: 0.78em; text-align:left;">
                <tr style="background:#2c3e50; color:#fff; position: sticky; top: 0; z-index:100;">
                    <th style="padding:6px;">บาร์โค้ด</th>
                    <th style="padding:6px; text-align:right;">ราคา</th>
                    <th style="padding:6px; text-align:right;">ทุน</th>
                    <th style="padding:6px; text-align:center;">สต็อก</th>
                    <th style="padding:6px; text-align:center;">ร้าน</th>
                </tr>
            </table>`;
        
        displayCount = 50;
        appendRows(0, displayCount);
    };

    initTable();

    const container = document.getElementById('tableContainer');
    container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 30) {
            if (displayCount < filteredProducts.length) {
                let nextCount = displayCount + 50;
                appendRows(displayCount, nextCount);
                displayCount = nextCount;
            }
        }
    });

    document.getElementById('searchProduct').addEventListener('input', (e) => {
        const filter = e.target.value.trim().toLowerCase();
        filteredProducts = products.filter(p => 
            (p.code && p.code.includes(filter)) ||
            (p.supplier && p.supplier.toLowerCase().includes(filter))
        );
        initTable();
    });
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

function sleepScanner(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isScanning) {
        html5QrcodeScanner.clear().then(() => {
            isScanning = false;
            const overlay = document.getElementById('sleepOverlay');
            if (overlay) overlay.style.display = 'flex';
            showStatus("💤 พักสแกนเนอร์");
        }).catch(err => console.error("Sleep Error:", err));
    }
}

function wakeScanner() {
    if (!isScanning) {
        isScanning = true;
        const overlay = document.getElementById('sleepOverlay');
        if (overlay) overlay.style.display = 'none';
        showStatus("📷 พร้อมสแกน");
        html5QrcodeScanner.render(onScanSuccess);
        if (typeof resetIdleTimer === 'function') resetIdleTimer();
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
}

setInterval(() => {
    const n = new Date();
    const dateStr = n.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = n.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const clockEl = document.getElementById('clock');
    const versionEl = document.getElementById('versionTag');
    
    if (clockEl) clockEl.innerText = dateStr + ' ' + timeStr;
    if (versionEl && typeof APP_VERSION !== 'undefined') versionEl.innerText = APP_VERSION;
}, 1000);

function showStatus(m){
    const s=document.getElementById("statusMessage");
    if(s) {
        s.innerText=m;
        setTimeout(()=>{s.innerText=""},3000);
    }
}

async function loadSheetData() {
    if(!navigator.onLine) {
        showStatus("📵 ออฟไลน์: ใช้ฐานข้อมูลในเครื่อง");
        return;
    }
    showStatus("⏳ กำลังซิงค์ฐานข้อมูลล่าสุดเบื้องหลัง...");
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
        showStatus("✅ อัปเดตฐานข้อมูลสำเร็จ (พร้อมใช้งานล่าสุด)");
        
        productArray = null;
        data = null;
    } catch (error) { 
        showStatus("⚠️ โหลดออนไลน์ล้มเหลว ดึงระบบแคชเครื่องทำงานทดแทน"); 
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

function autoScrollToBottom(){ const list = document.getElementById("itemList"); if(list) list.scrollTop = list.scrollHeight; }

function refreshList(){ const i=document.getElementById("itemList"); if(i) { i.innerHTML=""; Object.values(groupedItems).forEach(x=>renderItem(x)); autoScrollToBottom(); } }

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
    if(btn) {
        if(mode === 'CHECK'){ btn.innerText = "(" + count + ") ตรวจสอบรายการ"; }
        else if(mode === 'BUY'){ btn.innerText = "(" + count + ") จ่ายเงิน " + t + " บาท"; }
        else { btn.innerText = "(" + count + ") ชำระเงิน " + t + " บาท"; }
    }
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

function renderItem(i) {
    let l = document.createElement("li");
    l.className = "item-row";
    
    let st = (parseFloat(i.cost) > 0) ? "cost-filled" : "cost-empty";
    let mode = localStorage.getItem('zenMode') || 'SELL';
    
    let isCheck = mode === 'CHECK';
    let isBuy = mode === 'BUY';
    let isSell = mode === 'SELL';
    
    let qtyAttr = isCheck ? 'readonly' : ''; 
    let otherAttr = isBuy ? '' : 'readonly'; 
    let costClass = isSell ? 'hidden-cost' : 'visible-cost';
    let costOnClick = isSell ? 'onclick="toggleCostVisibility(this)"' : '';
    let imgSource = i.img || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORD5CYII=';

    l.innerHTML = `
        <img src="${imgSource}" 
             onclick="openImageFromCart('${imgSource}')" 
             style="cursor: pointer;" 
             onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORD5CYII='">
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

    const loadImage = (src) => new Promise((resolve) => {
        let img = new Image();
        img.crossOrigin = "anonymous"; 
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
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
            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bill)
            });
            await db.pendingSales.delete(bill.id);
        } catch(err) {
            console.error("Sync failed for bill:", bill.id, err);
            break; 
        }
    }
    
    pendingCount = await db.pendingSales.count();
    if(pendingCount === 0) {
        badge.style.display = 'none';
        showStatus("✅ ซิงค์ข้อมูลครบแล้ว!");
        
        if (typeof loadSheetData === 'function') {
            await loadSheetData();
        }
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
    currentReceived = parseInt((currentReceived === 0 ? "" : currentReceived.toString()) + n.toString()) || 0; 
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
    await finishSale(change, currentReceived, null); 
}

// --- ฟังก์ชันเปิดกล้อง/เลือกรูปสลิปโอนเงิน ---
function triggerSlipCamera(e) {
    if (e) {
        e.stopPropagation(); // ป้องกันคลิกส่งต่อไปยัง body
        e.preventDefault();
    }
    
    if (typeof groupedItems === 'undefined' || Object.keys(groupedItems).length === 0) {
        alert("ยังไม่มีสินค้าในตะกร้าครับ");
        return;
    }
    
    const slipInput = document.getElementById('slipFileInput');
    if (slipInput) {
        slipInput.click(); // เรียกเปิดกล้อง/ไฟล์
    } else {
        alert("❌ ไม่พบช่องอัปโหลดสลิป (slipFileInput)");
    }
}

async function handleSlipSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    showStatus("⏳ กำลังย่อและประมวลผลรูปสลิป...");
    try {
        // ย่อรูปสลิปให้อยู่ในช่วงไม่เกิน 800px และบีบอัดคุณภาพ JPEG เหลือ 75% (~100-200KB)
        const compressedBase64 = await resizeImageFile(file, 800, 800, 0.75);
        
        // ปิด Panel ชำระเงิน
        const panel = document.getElementById('paymentPanel');
        if (panel) panel.style.display = 'none';
        
        currentReceived = currentTotal;
        await finishSale(0, currentTotal, compressedBase64);
    } catch (err) {
        console.error("ประมวลผลสลิปล้มเหลว:", err);
        alert("เกิดข้อผิดพลาดในการถ่าย/อ่านรูปสลิป: " + (err.message || err));
    } finally {
        event.target.value = ""; // เคลียร์ค่าไฟล์เพื่อรอรับภาพใหม่ครั้งถัดไป
    }
}

// --- ฟังก์ชันย่อขนาดภาพผ่าน HTML5 Canvas อัตโนมัติก่อนส่ง Telegram ---
function resizeImageFile(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function finishSale(change = 0, received = 0, slipImage = null) { 
    if(Object.keys(groupedItems).length === 0) return showStatus("ยังไม่มีสินค้าในตะกร้า!"); 
    
    let mode = localStorage.getItem('zenMode') || 'SELL';
    let allItems = Object.values(groupedItems);
    let itemsToSync = allItems.map(i => {
        return { code: i.code, qty: i.qty, price: i.price, cost: i.cost, supplier: i.supplier, stock: i.stock };
    });

    const backupItems = { ...groupedItems }; 
    let currentDevice = getDeviceName(); 

    try {
        let batch1 = allItems.slice(0, 16); 
        let batch2 = allItems.slice(16, 32);
        let collage1 = await createCollage(batch1); 
        let collage2 = await createCollage(batch2);
        
        let billData = { 
            mode: mode, items: itemsToSync, collage1: collage1, collage2: collage2, slipImage: slipImage,
            total: currentTotal, received: received, change: change, timestamp: Date.now(),
            deviceName: currentDevice
        };
        
        await db.pendingSales.add(billData);
        
        groupedItems = {}; 
        refreshList(); 
        calculateTotal(); 
        updateCameraButton();

        if (slipImage) {
            speakText(`บันทึกสลิปโอนเงิน ${currentTotal} บาท เรียบร้อยแล้วครับ`);
        } else if (mode === 'SELL') {
            speakText(`ยอดรวม ${currentTotal} บาท รับเงิน ${received} บาท ทอน ${change} บาท ขอบคุณครับ`);
        } else {
            speakText(currentTotal + " บาท ขอบคุณครับ");
        }
        
        syncPendingSales();
        showStatus(slipImage ? "✅ บันทึกสลิปและปิดยอดขายสำเร็จ" : "✅ บันทึกการขายเรียบร้อย");
        
        billData = null;
        itemsToSync = null;
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
    if (mode === 'CHECK') {
        let count = Object.keys(groupedItems).length;
        if (count > 0 && confirm("ตรวจสอบสินค้าเสร็จสิ้น ต้องการล้างหน้าจอหรือไม่?")) {
            groupedItems = {}; refreshList(); calculateTotal();
            showStatus("🧹 ล้างหน้าจอแล้ว");
        } else if (count === 0) {
            alert("ยังไม่มีสินค้าในรายการครับ");
        }
        return;
    }

    let total = calculateTotal(); 
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
        if (previewTimer) clearTimeout(previewTimer);
        
        overlay.className = "cart-preview-active";
        overlayImg.src = imgSrc;
        overlay.style.display = "flex"; 
        overlay.style.opacity = "1"; 
        
        overlay.onclick = function() {
            overlay.style.opacity = "0";
            setTimeout(() => { overlay.style.display = "none"; }, 300);
            if (previewTimer) clearTimeout(previewTimer);
        };
        
        previewTimer = setTimeout(() => {
            overlay.style.opacity = "0";
            setTimeout(() => { overlay.style.display = "none"; }, 300);
        }, 3000);             
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
    localStorage.setItem('zenMode', 'SELL');
    let m = 'SELL'; 
    
    const modeSelectEl = document.getElementById('modeSelect');
    if(modeSelectEl) modeSelectEl.value = m; 
    applyModeColor(m);
    updateBarcodeTitle();
    
    const deviceNameInputEl = document.getElementById('deviceNameInput');
    if (deviceNameInputEl) {
        const savedName = localStorage.getItem('deviceName');
        if (savedName) {
            deviceNameInputEl.value = savedName;
        }

        const saveDeviceName = (e) => {
            const val = e.target.value.trim();
            if (val) {
                localStorage.setItem('deviceName', val);
            }
        };

        deviceNameInputEl.addEventListener('input', saveDeviceName);
        deviceNameInputEl.addEventListener('change', saveDeviceName);
        deviceNameInputEl.addEventListener('blur', saveDeviceName);
    }

    loadSheetData(); 
    syncPendingSales(); 
    
    if (modeSelectEl) {
        modeSelectEl.addEventListener('change', function(e) {
            let targetMode = e.target.value;
            if (targetMode === 'BUY') {
                let pwd = prompt("🔒 กรุณาใส่รหัสผ่านเพื่อเข้าสู่โหมดรับสินค้า:");
                if (pwd !== "16427531526374") {
                    alert("❌ รหัสผ่านไม่ถูกต้อง หรือยกเลิกการทำรายการ!");
                    targetMode = 'SELL';
                    e.target.value = 'SELL'; 
                }
            }
            localStorage.setItem('zenMode', targetMode);
            applyModeColor(targetMode);
            updateBarcodeTitle();
            refreshList();
            calculateTotal();
            showStatus("เปลี่ยนเป็นโหมด " + (targetMode === 'SELL' ? 'ขาย' : targetMode === 'BUY' ? 'ซื้อ' : 'ตรวจสอบ'));
        });
    }
    
    const previewOverlay = document.getElementById("scan-preview-overlay");
    if (previewOverlay) {
        previewOverlay.addEventListener("click", function() {
            this.style.opacity = "0";
            setTimeout(() => { this.style.display = "none"; }, 300);
        });
    }

    html5QrcodeScanner = new Html5QrcodeScanner("reader", {
        fps: 15, qrbox: {width: 220, height: 70}, facingMode: "environment",
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
            .then(() => console.log('✅ Service Worker Registered!'))
            .catch((err) => console.log('❌ Service Worker Failed', err));
    });
}