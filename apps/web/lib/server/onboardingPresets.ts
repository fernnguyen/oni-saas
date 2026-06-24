import { IDataConnector } from '@oni/adapters';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export async function seedShopPresets(
  connector: IDataConnector,
  tenantId: string,
  shopId: string,
  industryType: string
) {
  const admin = getSupabaseAdminClient();

  // 1. Create or overwrite default shop settings in Supabase DB with allow_negative_stock = true
  try {
    const { data: existingSettings } = await admin
      .from('shop_settings')
      .select('*')
      .eq('shop_id', shopId)
      .maybeSingle();

    if (!existingSettings) {
      await admin.from('shop_settings').insert({
        shop_id: shopId,
        shop_name: 'Cửa hàng mặc định',
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
        tax_rate: 0,
        invoice_prefix: 'ORD',
        low_stock_threshold: 5,
        allow_negative_stock: true, // Key onboarding setting
        default_price_type: 'retail',
        auto_print_receipt: true,
        mute_pos_sound: false,
        updated_at: new Date().toISOString(),
      });
    } else {
      await admin.from('shop_settings').update({
        allow_negative_stock: true, // enforce it for onboarding
        updated_at: new Date().toISOString(),
      }).eq('shop_id', shopId);
    }
  } catch (err) {
    console.error('Failed to seed shop_settings:', err);
  }

  // 2. Auto-initialize the system TIME_CHARGE product
  try {
    const resolvedIndustry = industryType ?? 'retail';
    const prodId =
      resolvedIndustry === 'billiards'
        ? 'TIME_CHARGE_BILLIARD'
        : resolvedIndustry === 'sports_court'
        ? 'TIME_CHARGE_COURT'
        : resolvedIndustry === 'lodging'
        ? 'TIME_CHARGE_ROOM'
        : resolvedIndustry === 'service_hourly'
        ? 'TIME_CHARGE_SERVICE'
        : 'TIME_CHARGE';

    const newProduct = {
      id: prodId,
      product_id: prodId,
      sku: prodId,
      name:
        resolvedIndustry === 'billiards'
          ? 'Dịch vụ tiền giờ Billiards (Hệ thống)'
          : resolvedIndustry === 'lodging'
          ? 'Dịch vụ tiền phòng (Hệ thống)'
          : 'Dịch vụ tiền giờ (Hệ thống)',
      active: 'TRUE',
      sell_price: '0',
      cost_price: '0',
      tax_rate: '0',
      input_tax_rate: '0',
      tax_group: 'dich_vu', // VAT 5%, PIT 2% under Circular 40/2021/TT-BTC
      product_type: 'service',
      branch_id: shopId,
    };
    await connector.create('products', newProduct);
  } catch (err) {
    console.error('Failed to seed TIME_CHARGE:', err);
  }

  // 3. Seed industry-specific presets
  try {
    if (industryType === 'fnb') {
      // Categories
      const catDrinks = await connector.create('categories', { name: 'Đồ uống', active: 'TRUE', sort_order: '1' });
      const catFood = await connector.create('categories', { name: 'Đồ ăn', active: 'TRUE', sort_order: '2' });

      // Products
      await connector.create('products', {
        name: 'Cà phê phin sữa đá',
        sku: 'CF001',
        category_id: catDrinks.id,
        unit: 'Ly',
        sell_price: '29000',
        cost_price: '10000',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Bạc xỉu nóng',
        sku: 'CF002',
        category_id: catDrinks.id,
        unit: 'Ly',
        sell_price: '32000',
        cost_price: '12000',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Bánh mì pate trứng',
        sku: 'BM001',
        category_id: catFood.id,
        unit: 'Cái',
        sell_price: '25000',
        cost_price: '10000',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      // Location Resources (Tables)
      await connector.create('location-resources', {
        name: 'Bàn 1',
        type: 'table',
        status: 'available',
        zone: 'Tầng 1',
        capacity: '4',
        hourly_rate: '0',
        sort_order: '1',
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Bàn 2',
        type: 'table',
        status: 'available',
        zone: 'Tầng 1',
        capacity: '4',
        hourly_rate: '0',
        sort_order: '2',
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Bàn VIP 1',
        type: 'table',
        status: 'available',
        zone: 'Phòng VIP',
        capacity: '8',
        hourly_rate: '0',
        sort_order: '3',
        branch_id: shopId,
      });
    } else if (industryType === 'billiards') {
      // Categories
      const catDrinks = await connector.create('categories', { name: 'Đồ uống', active: 'TRUE', sort_order: '1' });
      const catFood = await connector.create('categories', { name: 'Đồ ăn', active: 'TRUE', sort_order: '2' });

      // Products
      await connector.create('products', {
        name: 'Bia Heineken',
        sku: 'BEER01',
        category_id: catDrinks.id,
        unit: 'Chai',
        sell_price: '25000',
        cost_price: '18000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '50',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Nước ngọt Coca Cola',
        sku: 'COCA01',
        category_id: catDrinks.id,
        unit: 'Lon',
        sell_price: '15000',
        cost_price: '9000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '100',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Mì tôm trứng',
        sku: 'FOOD01',
        category_id: catFood.id,
        unit: 'Tô',
        sell_price: '30000',
        cost_price: '12000',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      // Location Resources (Billiard Tables)
      await connector.create('location-resources', {
        name: 'Bàn 1 (Libre)',
        type: 'table',
        status: 'available',
        zone: 'Khu thường',
        capacity: '4',
        hourly_rate: '50000',
        sort_order: '1',
        metadata: JSON.stringify({ subType: 'standard' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Bàn 2 (Libre)',
        type: 'table',
        status: 'available',
        zone: 'Khu thường',
        capacity: '4',
        hourly_rate: '50000',
        sort_order: '2',
        metadata: JSON.stringify({ subType: 'standard' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Bàn 3 (Pool)',
        type: 'table',
        status: 'available',
        zone: 'Khu thường',
        capacity: '4',
        hourly_rate: '60000',
        sort_order: '3',
        metadata: JSON.stringify({ subType: 'standard' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Bàn VIP 1 (3 Băng)',
        type: 'table',
        status: 'available',
        zone: 'Phòng VIP',
        capacity: '4',
        hourly_rate: '80000',
        sort_order: '4',
        metadata: JSON.stringify({ subType: 'vip' }),
        branch_id: shopId,
      });
    } else if (industryType === 'sports_court') {
      // Categories
      const catDrinks = await connector.create('categories', { name: 'Nước giải khát', active: 'TRUE', sort_order: '1' });
      const catService = await connector.create('categories', { name: 'Dịch vụ thuê đồ', active: 'TRUE', sort_order: '2' });

      // Products
      await connector.create('products', {
        name: 'Nước bù khoáng Revive',
        sku: 'REV01',
        category_id: catDrinks.id,
        unit: 'Chai',
        sell_price: '15000',
        cost_price: '8000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '80',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Thuê vợt Pickleball',
        sku: 'RENT01',
        category_id: catService.id,
        unit: 'Lượt',
        sell_price: '30000',
        cost_price: '0',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'dich_vu',
        product_type: 'service',
        branch_id: shopId,
      });

      // Location Resources (Courts)
      await connector.create('location-resources', {
        name: 'Sân 1',
        type: 'court',
        status: 'available',
        zone: 'Khu A',
        capacity: '6',
        hourly_rate: '80000',
        sort_order: '1',
        metadata: JSON.stringify({ subType: 'indoor' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Sân 2',
        type: 'court',
        status: 'available',
        zone: 'Khu A',
        capacity: '6',
        hourly_rate: '80000',
        sort_order: '2',
        metadata: JSON.stringify({ subType: 'indoor' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Sân VIP 3',
        type: 'court',
        status: 'available',
        zone: 'Khu VIP',
        capacity: '6',
        hourly_rate: '120000',
        sort_order: '3',
        metadata: JSON.stringify({ subType: 'vip' }),
        branch_id: shopId,
      });
    } else if (industryType === 'lodging') {
      // Categories
      const catMinibar = await connector.create('categories', { name: 'Mini Bar', active: 'TRUE', sort_order: '1' });

      // Products
      await connector.create('products', {
        name: 'Nước suối Aquafina',
        sku: 'AQUA01',
        category_id: catMinibar.id,
        unit: 'Chai',
        sell_price: '10000',
        cost_price: '3000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '40',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Mì ly Modern',
        sku: 'NOO01',
        category_id: catMinibar.id,
        unit: 'Ly',
        sell_price: '15000',
        cost_price: '7000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '24',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      // Location Resources (Rooms)
      await connector.create('location-resources', {
        name: 'Phòng 101',
        type: 'room',
        status: 'available',
        zone: 'Tầng 1',
        capacity: '2',
        hourly_rate: '60000',
        sort_order: '1',
        metadata: JSON.stringify({ subType: 'standard', bedType: 'single', overnightRate: 180000 }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Phòng 102',
        type: 'room',
        status: 'available',
        zone: 'Tầng 1',
        capacity: '4',
        hourly_rate: '80000',
        sort_order: '2',
        metadata: JSON.stringify({ subType: 'standard', bedType: 'double', overnightRate: 250000 }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Phòng 201 (VIP)',
        type: 'room',
        status: 'available',
        zone: 'Tầng 2',
        capacity: '4',
        hourly_rate: '120000',
        sort_order: '3',
        metadata: JSON.stringify({ subType: 'vip', bedType: 'king', overnightRate: 400000 }),
        branch_id: shopId,
      });
    } else if (industryType === 'service_hourly') {
      // Categories
      const catDrinks = await connector.create('categories', { name: 'Đồ uống', active: 'TRUE', sort_order: '1' });
      const catFood = await connector.create('categories', { name: 'Đồ ăn nhanh', active: 'TRUE', sort_order: '2' });

      // Products
      await connector.create('products', {
        name: 'Nước ngọt Coca Cola',
        sku: 'COCA01',
        category_id: catDrinks.id,
        unit: 'Lon',
        sell_price: '15000',
        cost_price: '9000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '120',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Mì tôm xúc xích',
        sku: 'FOOD02',
        category_id: catFood.id,
        unit: 'Tô',
        sell_price: '35000',
        cost_price: '15000',
        active: 'TRUE',
        stock_track: 'FALSE',
        stock_qty: '0',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      // Location Resources (Machines/PCs)
      await connector.create('location-resources', {
        name: 'Máy 01',
        type: 'room',
        status: 'available',
        zone: 'Khu thường',
        capacity: '1',
        hourly_rate: '10000',
        sort_order: '1',
        metadata: JSON.stringify({ subType: 'standard' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Máy 02',
        type: 'room',
        status: 'available',
        zone: 'Khu thường',
        capacity: '1',
        hourly_rate: '10000',
        sort_order: '2',
        metadata: JSON.stringify({ subType: 'standard' }),
        branch_id: shopId,
      });
      await connector.create('location-resources', {
        name: 'Máy VIP 10',
        type: 'room',
        status: 'available',
        zone: 'Phòng VIP',
        capacity: '1',
        hourly_rate: '15000',
        sort_order: '3',
        metadata: JSON.stringify({ subType: 'vip' }),
        branch_id: shopId,
      });
    } else {
      // Retail / Fashion / general fallback
      const catGeneral = await connector.create('categories', { name: 'Hàng hoá chung', active: 'TRUE', sort_order: '1' });

      await connector.create('products', {
        name: 'Sản phẩm mẫu A',
        sku: 'SPMA01',
        category_id: catGeneral.id,
        unit: 'Cái',
        sell_price: '150000',
        cost_price: '100000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '20',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });

      await connector.create('products', {
        name: 'Sản phẩm mẫu B',
        sku: 'SPMB02',
        category_id: catGeneral.id,
        unit: 'Cái',
        sell_price: '250000',
        cost_price: '180000',
        active: 'TRUE',
        stock_track: 'TRUE',
        stock_qty: '10',
        tax_group: 'phan_phoi',
        product_type: 'simple',
        branch_id: shopId,
      });
    }
  } catch (err) {
    console.error('Failed to seed industry specific presets:', err);
  }
}
