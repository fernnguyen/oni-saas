import { realtimeEngine } from './realtime';
import { dispatchNotification } from './notifications';


interface DispatchContext {
  tenantId: string;
  userId: string;
}

interface ShopContext {
  id: string;
  name: string;
  slug: string;
}

/**
 * Thư viện trung tâm điều phối thông báo nghiệp vụ (Multi-channel & Semantic-driven)
 */
export class NotificationDispatcher {
  
  /**
   * Sinh URL chuẩn hóa theo domain/subdomain của chi nhánh
   */
  private static makeBranchUrl(branchSlug: string, path: string): string {
    return `/${branchSlug}${path.startsWith('/') ? path : '/' + path}`;
  }

  /**
   * 1. Sự kiện: Thu ngân tạo đề xuất mua sắm mới (PR)
   */
  static async sendPrCreated(
    ctx: DispatchContext,
    shop: ShopContext,
    pr: { id: string; status: string }
  ): Promise<void> {
    if (pr.status === 'DRAFT') return;

    const path = this.makeBranchUrl(shop.slug, `/p2p/pr?search=${pr.id}`);
    const title = 'Đề xuất mua sắm mới cần báo giá';
    const content = `Yêu cầu #${pr.id} từ chi nhánh ${shop.name} đang chờ bạn khảo sát giá sản phẩm.`;

    // Kênh 1: In-App Realtime Notification (Tự động lọc theo RLS của Supabase / WS)
    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientRole: 'purchaser', // Chỉ gửi cho nhân viên mua sắm/báo giá
      type: 'purchase_approval',
      title,
      content,
      metadata: { purchase_id: pr.id, path, priority: 'high' }
    });

  }

  /**
   * 2. Sự kiện: Chuyển đổi trạng thái duyệt đề xuất mua sắm (PR)
   */
  static async sendPrTransition(
    ctx: DispatchContext,
    shop: ShopContext,
    pr: { id: string; created_by: string },
    action: 'ASSIGN_PRICE' | 'APPROVE_KTT' | 'APPROVE_GD' | 'REJECT'
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/p2p/pr?search=${pr.id}`);
    let title = '';
    let content = '';

    switch (action) {
      case 'ASSIGN_PRICE':
        title = 'Yêu cầu duyệt ngân sách mua sắm';
        content = `Phiếu #${pr.id} của chi nhánh ${shop.name} đã hoàn thành báo giá. Chờ KTT duyệt chi ngân sách.`;
        
        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientRole: 'chief_accountant', // Chỉ gửi cho Kế toán trưởng
          type: 'purchase_approval',
          title,
          content,
          metadata: { purchase_id: pr.id, path, priority: 'high' }
        });

        // Đồng thời gửi thông báo cập nhật cho người tạo phiếu
        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientId: pr.created_by, // Gửi đích danh người tạo
          type: 'purchase_approval',
          title: 'Phiếu đề xuất mua sắm đã có báo giá',
          content: `Phiếu PR #${pr.id} của bạn đã được báo giá. Đang chờ Kế toán trưởng duyệt ngân sách.`,
          metadata: { purchase_id: pr.id, path, priority: 'medium' }
        });
        break;

      case 'APPROVE_KTT':
        title = 'Đề xuất mua sắm chờ Giám đốc duyệt';
        content = `Phiếu #${pr.id} đã được Kế toán trưởng chi nhánh ${shop.name} duyệt hạn mức. Chờ Giám đốc phê duyệt.`;

        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientRole: 'owner', // Chỉ gửi cho Owner/Director
          type: 'purchase_approval',
          title,
          content,
          metadata: { purchase_id: pr.id, path, priority: 'high' }
        });

        // Đồng thời gửi thông báo cập nhật cho người tạo phiếu
        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientId: pr.created_by, // Gửi đích danh người tạo
          type: 'purchase_approval',
          title: 'Đề xuất mua sắm đã được duyệt ngân sách',
          content: `Phiếu PR #${pr.id} của bạn đã được Kế toán trưởng duyệt ngân sách. Đang chờ Giám đốc phê duyệt.`,
          metadata: { purchase_id: pr.id, path, priority: 'medium' }
        });
        break;

      case 'APPROVE_GD':
        title = 'Đề xuất mua sắm đã được phê duyệt! 🎉';
        content = `Đề xuất PR #${pr.id} của bạn đã được phê duyệt bởi Giám đốc chi nhánh ${shop.name}.`;

        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientId: pr.created_by, // Bắn đích danh 1-1 cho người tạo phiếu
          type: 'system',
          title,
          content,
          metadata: { purchase_id: pr.id, path }
        });
        break;

      case 'REJECT':
        title = 'Đề xuất mua sắm bị từ chối ❌';
        content = `Đề xuất PR #${pr.id} của bạn đã bị từ chối bởi quản lý chi nhánh ${shop.name}.`;

        await realtimeEngine.sendNotification({
          tenantId: ctx.tenantId,
          branchId: shop.id,
          recipientId: pr.created_by, // Bắn đích danh 1-1 cho người tạo phiếu
          type: 'system',
          title,
          content,
          metadata: { purchase_id: pr.id, path }
        });
        break;
    }

  }

  /**
   * 2b. Sự kiện: Tạo đơn mua hàng PO từ đề xuất (PR -> PO)
   */
  static async sendPoCreatedFromPr(
    ctx: DispatchContext,
    shop: ShopContext,
    pr: { id: string; created_by: string },
    po: { id: string }
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/p2p/po?search=${po.id}`);
    const title = 'Đơn mua hàng PO đã được khởi tạo! 📦';
    const content = `Đơn mua hàng #${po.id} đã được tạo thành công từ phiếu đề xuất PR #${pr.id} của bạn.`;

    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientId: pr.created_by, // Gửi đích danh người tạo
      type: 'purchase_approval',
      title,
      content,
      metadata: { purchase_id: pr.id, po_id: po.id, path, priority: 'medium' }
    });

  }

  /**
   * 2c. Sự kiện: Lập phiếu đối chiếu nhập kho (GRN Created)
   */
  static async sendGrnCreated(
    ctx: DispatchContext,
    shop: ShopContext,
    po: { id: string; purchaser_id: string },
    grn: { id: string },
    prCreatorId?: string
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/p2p/grn?search=${grn.id}`);
    
    // Gửi cho Thủ kho duyệt
    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientRole: 'warehouse.manage',
      type: 'purchase_approval',
      title: 'Yêu cầu đối chiếu nhập kho mới 📦',
      content: `Đơn hàng PO #${po.id} đã được lập phiếu đối chiếu GRN #${grn.id}. Vui lòng thực hiện kiểm đếm và duyệt nhập kho.`,
      metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'medium' }
    });

    // Gửi cho người lập đơn hàng (Purchaser)
    if (po.purchaser_id) {
      await realtimeEngine.sendNotification({
        tenantId: ctx.tenantId,
        branchId: shop.id,
        recipientId: po.purchaser_id,
        type: 'purchase_approval',
        title: 'Đã lập phiếu đối chiếu nhập kho',
        content: `Đơn mua hàng PO #${po.id} của bạn đã được lập phiếu đối chiếu GRN #${grn.id} và đang chờ thủ kho phê duyệt nhập kho.`,
        metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'low' }
      });
    }

    // Gửi cho người tạo phiếu PR ban đầu (nếu có)
    if (prCreatorId) {
      await realtimeEngine.sendNotification({
        tenantId: ctx.tenantId,
        branchId: shop.id,
        recipientId: prCreatorId,
        type: 'purchase_approval',
        title: 'Đã lập phiếu đối chiếu nhập kho 📦',
        content: `Hàng hóa đề xuất từ phiếu PR ban đầu của bạn đã được lập phiếu đối chiếu nhập kho GRN #${grn.id} (Đơn PO #${po.id}) và đang chờ thủ kho kiểm đếm.`,
        metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'medium' }
      });
    }

  }

  /**
   * 2d. Sự kiện: Phê duyệt nhập kho thành công (GRN Approved)
   */
  static async sendGrnApproved(
    ctx: DispatchContext,
    shop: ShopContext,
    po: { id: string; purchaser_id: string; supplier_name?: string },
    grn: { id: string },
    prCreatorId?: string
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/p2p/grn?search=${grn.id}`);

    // Gửi cho người lập đơn hàng (Purchaser)
    if (po.purchaser_id) {
      await realtimeEngine.sendNotification({
        tenantId: ctx.tenantId,
        branchId: shop.id,
        recipientId: po.purchaser_id,
        type: 'purchase_approval',
        title: 'Nhập kho thành công! 🎉',
        content: `Đơn mua hàng PO #${po.id} của bạn đã được duyệt nhập kho thành công qua phiếu GRN #${grn.id}. Hàng hóa đã cộng vào tồn kho.`,
        metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'high' }
      });
    }

    // Gửi cho người tạo phiếu PR ban đầu (nếu có)
    if (prCreatorId) {
      await realtimeEngine.sendNotification({
        tenantId: ctx.tenantId,
        branchId: shop.id,
        recipientId: prCreatorId,
        type: 'purchase_approval',
        title: 'Hàng hóa đề xuất đã nhập kho! 📦🎉',
        content: `Hàng hóa từ đề xuất PR ban đầu của bạn đã được thủ kho chi nhánh ${shop.name} duyệt nhập kho thành công qua phiếu GRN #${grn.id} (Đơn PO #${po.id}). Tồn kho đã sẵn sàng bán hàng.`,
        metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'high' }
      });
    }

    // Gửi cho Kế toán trưởng cập nhật công nợ
    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientRole: 'chief_accountant',
      type: 'purchase_approval',
      title: 'Hoàn tất nhập kho - Cập nhật công nợ 💸',
      content: `Phiếu GRN #${grn.id} của đơn hàng PO #${po.id} đã được duyệt. Công nợ nhà cung cấp ${po.supplier_name || ''} đã được cập nhật.`,
      metadata: { purchase_id: po.id, grn_id: grn.id, path, priority: 'medium' }
    });

  }

  /**
   * 3. Sự kiện: Khách quét QR yêu cầu mở bàn (QR Session)
   */
  static async sendQrSessionCreated(
    tenantId: string,
    shop: ShopContext,
    session: { id: string; resource_id: string; table_name?: string }
  ): Promise<void> {
    const tableName = session.table_name || 'Bàn ăn';
    const path = this.makeBranchUrl(shop.slug, `/channels/pos`);
    const title = 'Yêu cầu mở bàn ăn QR';
    const content = `${tableName} vừa quét mã QR và yêu cầu mở bàn ăn tại chi nhánh ${shop.name}.`;

    // Kênh 1: In-App Realtime Notification (Lưu lịch sử Noti History & Đẩy cho staff trong chi nhánh)
    try {
      await realtimeEngine.sendNotification({
        tenantId,
        branchId: shop.id,
        recipientId: undefined, // Broadcast to all users of the branch
        recipientRole: undefined, // Broadcast to all roles of the branch
        type: 'qr_session',
        title,
        content,
        metadata: {
          shopId: shop.id,
          branchId: shop.id,
          resourceId: session.resource_id,
          sessionId: session.id,
          path,
          priority: 'high'
        }
      });
    } catch (err) {
      console.error('Failed to persist QR session in-app notification:', err);
    }

    // Kênh 2: Telegram Bot (đẩy cho quản trị viên/thu ngân nhận tin ngoài ứng dụng)
    try {
      await dispatchNotification(tenantId, 'QR_SESSION_CREATED', {
        title,
        message: content,
        url: path
      });
    } catch (err) {
      console.error('Telegram notification dispatch failed for QR_SESSION_CREATED:', err);
    }
  }

  /**
   * 4. Sự kiện: Khách gọi món qua QR (QR Order Request)
   */
  static async sendQrOrderCreated(
    tenantId: string,
    shop: ShopContext,
    order: { id: string; resource_id: string; table_name?: string; item_count: number }
  ): Promise<void> {
    const tableName = order.table_name || 'Bàn ăn';
    const path = this.makeBranchUrl(shop.slug, `/channels/pos`);
    const title = 'Yêu cầu gọi món QR mới';
    const content = `${tableName} vừa gửi yêu cầu duyệt ${order.item_count} món ăn mới tại chi nhánh ${shop.name}.`;

    // Kênh 1: In-App Realtime Notification (Lưu lịch sử Noti History & Đẩy cho staff trong chi nhánh)
    try {
      await realtimeEngine.sendNotification({
        tenantId,
        branchId: shop.id,
        recipientId: undefined, // Broadcast to all users of the branch
        recipientRole: undefined, // Broadcast to all roles of the branch
        type: 'qr_order',
        title,
        content,
        metadata: {
          shopId: shop.id,
          branchId: shop.id,
          resourceId: order.resource_id,
          orderId: order.id,
          itemCount: order.item_count,
          path,
          priority: 'high'
        }
      });
    } catch (err) {
      console.error('Failed to persist QR order in-app notification:', err);
    }

    // Kênh 2: Telegram Bot
    try {
      await dispatchNotification(tenantId, 'QR_ORDER_CREATED', {
        title,
        message: content,
        url: path
      });
    } catch (err) {
      console.error('Telegram notification dispatch failed for QR_ORDER_CREATED:', err);
    }
  }

  /**
   * 5. Sự kiện: Cảnh báo tồn kho thấp (Low Stock)
   */
  static async sendLowStockAlert(
    ctx: DispatchContext,
    shop: ShopContext,
    product: { id: string; name: string; current_qty: number }
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/inventory`);
    const title = 'Cảnh báo tồn kho thấp ⚠️';
    const content = `Sản phẩm "${product.name}" tại chi nhánh ${shop.name} chỉ còn ${product.current_qty} sản phẩm trong kho.`;

    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientRole: 'admin', // Gửi cho cấp quản lý kho/admin
      type: 'low_stock',
      title,
      content,
      metadata: { product_id: product.id, path, priority: 'medium' }
    });
  }

  /**
   * 6. Sự kiện: Cảnh báo công nợ sắp đến hạn (Debt Alert)
   */
  static async sendDebtAlert(
    ctx: DispatchContext,
    shop: ShopContext,
    debt: { id: string; partner_name: string; amount: number }
  ): Promise<void> {
    const path = this.makeBranchUrl(shop.slug, `/debt`);
    const title = 'Cảnh báo công nợ đến hạn 💸';
    const content = `Khoản công nợ #${debt.id} của đối tác "${debt.partner_name}" giá trị ${debt.amount.toLocaleString('vi-VN')}đ đã đến hạn thanh toán.`;

    await realtimeEngine.sendNotification({
      tenantId: ctx.tenantId,
      branchId: shop.id,
      recipientRole: 'chief_accountant', // Gửi cho Kế toán
      type: 'debt_alert',
      title,
      content,
      metadata: { debt_id: debt.id, path, priority: 'high' }
    });
  }
}
