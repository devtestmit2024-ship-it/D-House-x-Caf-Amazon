// ใส่ URL ของ Web API SQL ที่นี่ เช่น 'https://api.example.com/api'
// หากเว้นว่างไว้ แอปจะใช้ข้อมูลทดลองจากอุปกรณ์นี้ เพื่อให้ทดสอบหน้าจอได้ทันที
window.API_BASE_URL = '';

// URL ของ Supabase Project (เช่น https://abcdefghijklm.supabase.co)
window.SUPABASE_URL = 'https://eafykaqxzukclpjtvfwk.supabase.co';

// Anon Key (Public) สำหรับเชื่อมต่อจาก Frontend
window.SUPABASE_KEY = 'sb_publishable_7lFXAWtl6-hmCl4H5fL0Eg_9O7VcJRk';

// API Timeout
window.API_TIMEOUT_MS = 12000;

// Print Agent สำหรับพิมพ์อัตโนมัติจาก PWA บนคอมพิวเตอร์เครื่องร้าน
// รัน print-agent/start.bat ก่อน แล้วระบุ URL นี้ เช่น 'http://127.0.0.1:17891'
// ปล่อยเป็นค่าว่างหากไม่ได้ใช้ Print Agent
//window.PRINT_AGENT_URL = '';
window.PRINT_AGENT_TOKEN = '';
// ชื่อเครื่องพิมพ์ตามที่แสดงใน Windows; ปล่อยว่างให้ใช้เครื่องพิมพ์ค่าเริ่มต้น
//window.PRINT_AGENT_PRINTER_NAME = '';
// ปรับให้ตรงกับ API ของคุณได้ในไฟล์ api.js

window.PRINT_AGENT_URL = 'http://127.0.0.1:17891';
window.PRINT_AGENT_PRINTER_NAME = 'ชื่อ XP-Q90EC ตามใน Windows';

