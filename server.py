from flask import Flask, request, jsonify
import datetime
import requests

app = Flask(__name__)
DB_FILE = "products.txt"
LINE_TOKEN = 'ใส่รหัสTokenของศิษย์พี่ตรงนี้ครับ' # ก๊อป Token มาใส่ตรงนี้

def send_line_notify(message):
    try:
        url = 'https://notify-api.line.me/api/notify'
        headers = {'Authorization': 'Bearer ' + LINE_TOKEN}
        data = {'message': message}
        requests.post(url, headers=headers, data=data)
    except Exception as e:
        print(f"Error sending LINE: {e}")

def update_stock(barcode_input):
    updated_lines = []
    found = None
    alert = None
    
    with open(DB_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    for line in lines:
        parts = line.strip().split()
        if len(parts) < 5: continue
        
        b_val = parts[0][1:]
        n_val = parts[1][1:]
        c_val = parts[2][1:]
        p_val = parts[3][1:]
        s_val = int(parts[4][1:])
        
        if b_val == barcode_input and s_val > 0:
            found = {"name": n_val, "cost": c_val, "price": p_val, "barcode": b_val}
            s_val -= 1
            if s_val < 3:
                alert = f"\n⚠️ เตือน: {n_val} เหลือสต็อกแค่ {s_val} ชิ้น!"
            
        new_line = f"B{b_val} N{n_val} C{c_val} P{p_val} S{s_val}"
        updated_lines.append(new_line)
        
    with open(DB_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(updated_lines) + "\n")
        
    return found, alert

@app.route('/save-data', methods=['POST'])
def save_data():
    items = request.json['items']
    for code in items:
        prod, alert = update_stock(code)
        if prod:
            msg = f"\n✅ ขายสินค้า:\nบาร์โค้ด: {prod['barcode']}\nชื่อ: {prod['name']}\nทุน: {prod['cost']}\nขาย: {prod['price']}"
            if alert: msg += alert
            send_line_notify(msg)
            
    return jsonify({"status": "success"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)