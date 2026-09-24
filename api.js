// api.js (ระบบพนักงานขาย - Supabase Integration)

/**
 * ฟังก์ชันสร้าง/ดึง Client Instance ของ Supabase
 */
function getSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('ระบบยังโหลด Supabase SDK ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง');
  }
  if (!window._supabaseInstance) {
    window._supabaseInstance = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  }
  return window._supabaseInstance;
}

/**
 * ฟังก์ชันทำความสะอาดข้อความ (Trim)
 */
function cleanString(val) {
  return String(val || '').trim();
}

/**
 * แผนที่รายการสินค้า (Product Map)
 */
const PRODUCT_MAP = {
  '1': { name: 'แบล็คคอฟฟี (เย็น)', image: 'public/assets/image/black-coffee.webp' },
  '2': { name: 'เอสเปรสโซ (เย็น)', image: 'public/assets/image/espresso.webp' },
  '3': { name: 'ชานม (เย็น)', image: 'public/assets/image/tea-with-milk.webp' }
};

window.staffApi = {
  /**
   * ตรวจสอบสิทธิ์ก่อนเปิดหน้าจัดการสมาชิก
   * User ใช้เบอร์โทรศัพท์ที่บันทึกใน Phone_No
   */
  async verifyAdminCredentials(username, password) {
    const supabase = getSupabase();
    const user = cleanString(username);
    const pass = String(password ?? '');

    if (!user || !pass) throw new Error('กรุณากรอก User และ Password ให้ครบถ้วน');

    const { data, error } = await supabase
      .from('Cafe_Amazon_Promosion_House')
      .select('ID, Name, Phone_No, Access_Level')
      .eq('Phone_No', user)
      .eq('PassWord', pass)
      .eq('Access_Level', 1)
      .maybeSingle();

    if (error) throw new Error(`ตรวจสอบสิทธิ์ไม่สำเร็จ: ${error.message}`);
    if (!data) throw new Error('User หรือ Password ไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์แอดมิน');

    return { id: data.ID, name: data.Name, username: data.Phone_No, accessLevel: data.Access_Level };
  },

  /**
   * 0. ฟังก์ชันเจนเลขบิลอัตโนมัติ (YYYYMMDD0001)
   * เลขรัน 4 หลัก และรีเซ็ตเป็น 0001 เมื่อเป็นบิลแรกของวัน
   */
  async generateBillNo() {
    const supabase = getSupabase();
    const now = new Date();
    
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yyyy}${mm}${dd}`; // เช่น 20260922

    // ค้นหาบิลล่าสุดของวันนี้ในตาราง Cafe_Amazon_Bill
    const { data, error } = await supabase
      .from('Cafe_Amazon_Bill')
      .select('Bill_No')
      .like('Bill_No', `${datePrefix}%`)
      .order('Bill_No', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSequence = 1;
    if (data && data.Bill_No && data.Bill_No.length >= 12) {
      // ดึงเลขรัน 4 หลักสุดท้ายมาแปลงเป็นตัวเลข
      const lastSeqStr = data.Bill_No.substring(8, 12);
      const lastSeqInt = parseInt(lastSeqStr, 10);
      if (!isNaN(lastSeqInt)) {
        nextSequence = lastSeqInt + 1;
      }
    }

    const seqString = String(nextSequence).padStart(4, '0');
    return `${datePrefix}${seqString}`;
  },

  // api.js (เฉพาะส่วน generateBillNo)

/**
 * 0. ฟังก์ชันเจนเลขบิลอัตโนมัติ (YYYYMMDD0001)
 * เลขรัน 4 หลัก และรีเซ็ตเป็น 0001 เมื่อเป็นบิลแรกของวัน (ไม่มีตัวหนังสือ)
 */
async generateBillNo() {
  const supabase = getSupabase();
  const now = new Date();
  
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${yyyy}${mm}${dd}`; // เช่น 20260922

  // ค้นหาบิลล่าสุดของวันนี้ในตาราง Cafe_Amazon_Bill
  const { data, error } = await supabase
    .from('Cafe_Amazon_Bill')
    .select('Bill_No')
    .like('Bill_No', `${datePrefix}%`)
    .order('Bill_No', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSequence = 1;
  if (data && data.Bill_No && data.Bill_No.length === 12) {
    // ดึงเลขรัน 4 หลักสุดท้ายมาแปลงเป็นตัวเลข
    const lastSeqStr = data.Bill_No.substring(8, 12);
    const lastSeqInt = parseInt(lastSeqStr, 10);
    if (!isNaN(lastSeqInt)) {
      nextSequence = lastSeqInt + 1;
    }
  }

  const seqString = String(nextSequence).padStart(4, '0');
  return `${datePrefix}${seqString}`;
},
  /**
   * 1. ค้นหาและตรวจสอบข้อมูลสิทธิ์ก่อนทำรายการ
   * @param {string} searchKey - เบอร์โทรศัพท์ หรือ รหัสคูปอง
   */
  // api.js (แก้ไข checkCouponInfo เพิ่มการดึง Project_ID)
  async checkCouponInfo(searchKey) {
  const supabase = getSupabase();
  const cleanKey = cleanString(searchKey);

  if (!cleanKey) throw new Error('ข้อมูลเบอร์โทรศัพท์หรือรหัสคูปองไม่ถูกต้อง');

  // 1. เพิ่ม Project_ID ใน .select()
  const { data, error } = await supabase
    .from('Cafe_Amazon_Promosion_House')
    .select('ID, Name, Phone_No, House_Number, Project_ID, All_Use, All_Limit, Confirm_Coupon, LastUse_Date, Coupon_No, Product_ID')
    .or(`Phone_No.eq.${cleanKey},Coupon_No.eq.${cleanKey}`)
    .maybeSingle();

  if (error) throw new Error(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}`);
  if (!data) throw new Error(`ไม่พบข้อมูลสมาชิกหรือคูปอง (${cleanKey}) ในระบบ`);

  if (data.Confirm_Coupon === true) {
    throw new Error('❌ คูปองนี้ถูกใช้งานไปแล้ว ไม่สามารถใช้ซ้ำได้');
  }

  if (!data.Coupon_No && cleanKey.startsWith('CPN-')) {
    throw new Error('❌ ไม่พบคูปองนี้ในระบบ (อาจถูกใช้ไปแล้วหรือหมดอายุ)');
  }

  const productIdStr = data.Product_ID ? String(data.Product_ID) : null;
  const product = productIdStr ? PRODUCT_MAP[productIdStr] : null;
  const productName = product?.name || (productIdStr ? `สินค้า รหัส ${productIdStr}` : 'ไม่ได้เลือกสินค้า');

  return {
    id: data.ID,
    name: data.Name || 'ลูกค้า Cafe Amazon',
    phone: data.Phone_No,
    address: data.House_Number || '-',
    project: data.Project_ID || '-', // 2. แมปค่า project เพิ่มตรงนี้
    usedCount: data.All_Use ?? 0,
    allLimit: data.All_Limit ?? 50,
    confirmCoupon: data.Confirm_Coupon ?? false,
    lastUseDate: data.LastUse_Date,
    couponNo: data.Coupon_No || 'ไม่มีคูปองที่ใช้งานอยู่',
    productId: productIdStr,
    productName: productName,
    productImage: product?.image || null
  };
  },

  /**
   * 2. ดึงประวัติการใช้สิทธิ์/ออกใบเสร็จย้อนหลังของลูกค้า
   * @param {string} userPhone - เบอร์โทรศัพท์ลูกค้า
   */
  // api.js (เฉพาะส่วน getHistory)

async getHistory(userPhone) {
  const supabase = getSupabase();
  const cleanPhone = cleanString(userPhone);

  if (!cleanPhone) throw new Error('ไม่พบข้อมูลเบอร์โทรศัพท์สำหรับค้นหาประวัติ');

  // 1. ดึงข้อมูลสมาชิกจากเบอร์โทร
  const { data: userData, error: userErr } = await supabase
    .from('Cafe_Amazon_Promosion_House')
    .select('ID, Phone_No')
    .eq('Phone_No', cleanPhone)
    .maybeSingle();

  if (userErr) throw new Error(`เกิดข้อผิดพลาดในการค้นหาผู้ใช้งาน: ${userErr.message}`);
  if (!userData) return [];

  // 2. ดึงประวัติบิลจาก Cafe_Amazon_Bill
  const { data: bills, error: billErr } = await supabase
    .from('Cafe_Amazon_Bill')
    .select('Bill_No, ItemDetail, InsertDate, Coupon_No, Product_Type')
    .eq('Cafe_Amazon_PK', userData.ID)
    .order('InsertDate', { ascending: false });

  if (billErr) throw new Error(`เกิดข้อผิดพลาดในการดึงประวัติการใช้สิทธิ์: ${billErr.message}`);

  return (bills || []).map((bill) => {
    const pId = bill.Product_Type ? String(bill.Product_Type).trim() : null;
    const mappedProduct = pId ? PRODUCT_MAP[pId] : null;

    const formattedDate = bill.InsertDate
      ? new Date(bill.InsertDate).toLocaleString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '-';

    return {
      billNo: bill.Bill_No || '-',
      useDate: formattedDate,
      phone: cleanPhone,
      productName: bill.ItemDetail || mappedProduct?.name || 'รายการสินค้า',
      productImage: mappedProduct?.image || null,
      couponNo: bill.Coupon_No || '-'
    };
  });
  },

  /**
   * 3. บันทึกข้อมูลลง Cafe_Amazon_Bill และ อัปเดต Cafe_Amazon_Promosion_House
   * @param {Object} userData - ข้อมูลสมาชิก/คูปองที่ได้จาก checkCouponInfo
   * @param {string} billNo - เลขที่บิล
   * @param {string} staffCode - รหัสพนักงาน
   */
  async commitRedeemTransaction(userData, billNo, staffCode = 'STAFF_001') {
    const supabase = getSupabase();
    const cleanPhone = cleanString(userData.phone);
    const pkValue = userData.id ? parseInt(userData.id, 10) : null;
    const nextUsedCount = (userData.usedCount || 0) + 1;

    const rawProductId = userData.productId ? String(userData.productId) : '1';

    const { error: billErr } = await supabase
      .from('Cafe_Amazon_Bill')
      .insert([
        {
          Bill_No: billNo,
          Cafe_Amazon_PK: pkValue,
          Product_Type: rawProductId.substring(0, 13),
          ItemDetail: userData.productName,
          Price: 0.00,
          Discount: 0.00,
          Change: 0.00,
          InsertDate: new Date().toISOString(),
          IsUse: true,
          Coupon_No: userData.couponNo !== 'ไม่มีคูปองที่ใช้งานอยู่' ? userData.couponNo : null
        }
      ]);

    if (billErr) {
      throw new Error(`บันทึกข้อมูลใบเสร็จ (Bill) ล้มเหลว: ${billErr.message}`);
    }

    const { error: updateErr } = await supabase
      .from('Cafe_Amazon_Promosion_House')
      .update({
        All_Use: nextUsedCount,
        LastUse_Date: new Date().toISOString(),
        Confirm_Coupon: true,
        Coupon_No: null,
        Product_ID: null,
        UpdateDate: new Date().toISOString(),
        UpdateUser: staffCode
      })
      .eq('Phone_No', cleanPhone)
      .eq('Confirm_Coupon', false);

    if (updateErr) {
      throw new Error(`บันทึก Bill สำเร็จ แต่ใช้สิทธิ์ในตารางหลักล้มเหลว: ${updateErr.message}`);
    }

    return {
      success: true,
      phone: cleanPhone,
      billNo: billNo,
      usedCount: nextUsedCount
    };
  },

  /**
   * 4. ดึงตารางข้อมูลสมาชิกทั้งหมด
   */
  async getHouseTableData() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('Cafe_Amazon_Promosion_House')
      .select('ID, Name, Phone_No, House_Number, Project_ID, All_Use, All_Limit, Day_Limit, IsUse, Access_Level, Confirm_Coupon, Product_ID')
      .order('Name', { ascending: true });

    if (error) throw new Error(`ดึงข้อมูลตารางล้มเหลว: ${error.message}`);

    return (data || []).map(item => ({
      id: item.ID,
      name: item.Name || '-',
      phone: item.Phone_No || '-',
      address: item.House_Number || '-',
      project: item.Project_ID || '-',
      usedCount: item.All_Use ?? 0,
      allLimit: item.All_Limit ?? 10,
      quotaPerDay: item.Day_Limit ?? 1, // อ่านค่า Day_Limit จากเบส
      isUse: item.IsUse ?? false,
      accessLevel: item.Access_Level ?? 0
    }));
  },

  /**
   * 5. เพิ่ม หรือ แก้ไขข้อมูลสมาชิก
   */
    async saveHouseData(payload) {
    const supabase = getSupabase();
    const cleanPhone = cleanString(payload.phone);
    const cleanName = cleanString(payload.name);

    if (!cleanPhone || !cleanName) {
      throw new Error('กรุณากรอกชื่อ-นามสกุล และ เบอร์โทรศัพท์ ให้ครบถ้วน');
    }

    const dayLimitValue = payload.quotaPerDay ?? payload.Day_Limit ?? 1;

    const recordData = {
      Name: cleanName,
      Phone_No: cleanPhone,
      House_Number: cleanString(payload.address),
      Project_ID: cleanString(payload.project),
      Day_Limit: dayLimitValue,  // ✅ บันทึกตรงตามค่าที่กรอก (หรือ quotaPerDay)
      Access_Level: Number(payload.accessLevel) === 1 ? 1 : 0,
      IsUse: payload.id ? Boolean(payload.isUse) : false,
      All_Use: payload.usedCount ?? 0,
      All_Limit: payload.allLimit ?? 10,
      UpdateDate: new Date().toISOString()
    };

    if (payload.id) {
      // ✏️ กรณีแก้ไขข้อมูลเดิม (UPDATE)
      const { error } = await supabase
        .from('Cafe_Amazon_Promosion_House')
        .update(recordData)
        .eq('ID', payload.id);

      if (error) throw new Error(`อัปเดตข้อมูลล้มเหลว: ${error.message}`);
    } else {
      // ➕ กรณีเพิ่มข้อมูลใหม่ครั้งแรก (INSERT)
      recordData.PassWord = '1234'; 

      const { error } = await supabase
        .from('Cafe_Amazon_Promosion_House')
        .insert([recordData]);

      if (error) throw new Error(`เพิ่มข้อมูลใหม่ล้มเหลว: ${error.message}`);
    }

    return { success: true };
    },

  /**
   * 6. ลบข้อมูลสมาชิก
   */
  async deleteHouseData(id) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('Cafe_Amazon_Promosion_House')
      .delete()
      .eq('ID', id);

    if (error) throw new Error(`ลบข้อมูลล้มเหลว: ${error.message}`);
    return { success: true };
  },

  /**
   * 7. รีเซ็ตรหัสผ่านกลับเป็น 1234
   */
  async resetPassword(id, newPassword = '1234') {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('Cafe_Amazon_Promosion_House')
      .update({ 
        PassWord: newPassword, // ใช้อักษรตัวพิมพ์เล็กให้ตรงกับใน Supabase
        UpdateDate: new Date().toISOString()
      })
      .eq('ID', id);

    if (error) throw new Error(`รีเซ็ตรหัสผ่านล้มเหลว: ${error.message}`);
    return { success: true };
  }
};
