CREATE TABLE "asset_allocations" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"asset_id" varchar(255) NOT NULL,
	"department_id" varchar(255) NOT NULL,
	"department_code" varchar(50),
	"qty" varchar(50) NOT NULL,
	"allocated_at" varchar(50) NOT NULL,
	"note" text,
	"recipient_name" varchar(255),
	"created_by" varchar(255),
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "asset_depreciations" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"asset_id" varchar(255) NOT NULL,
	"depreciation_date" varchar(50) NOT NULL,
	"amount" varchar(50) NOT NULL,
	"depreciated_value_before" varchar(50) DEFAULT '0',
	"depreciated_value_after" varchar(50) DEFAULT '0',
	"department_id" varchar(255) NOT NULL,
	"department_code" varchar(50),
	"cashbook_id" varchar(255),
	"created_by" varchar(255),
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"name" varchar(255) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"type" varchar(50) NOT NULL,
	"original_value" varchar(50) NOT NULL,
	"salvage_value" varchar(50) DEFAULT '0',
	"purchase_date" varchar(50) NOT NULL,
	"depreciation_months" varchar(50) NOT NULL,
	"depreciated_value" varchar(50) DEFAULT '0',
	"status" varchar(50) DEFAULT 'active',
	"serial_no" varchar(255),
	"manufacturer" varchar(255),
	"warranty_expiry" varchar(50),
	"supplier_id" varchar(255),
	"created_by" varchar(255),
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "booking_channels" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100),
	"commission_rate" varchar(50) DEFAULT '0',
	"color" varchar(50) DEFAULT '#3b82f6',
	"notes" text,
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "cashbook" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"type" varchar(50),
	"amount" varchar(50),
	"method" varchar(50),
	"category" varchar(255),
	"reference_id" varchar(255),
	"reference_name" varchar(255),
	"employee_id" varchar(255),
	"note" text,
	"date" varchar(50),
	"fund_id" varchar(255),
	"balance_after_transaction" varchar(50),
	"department_code" varchar(50),
	"department_id" varchar(255),
	"parent_transaction_id" varchar(255),
	"is_virtual" varchar(10) DEFAULT 'FALSE'
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"parent_id" varchar(255),
	"sort_order" varchar(50),
	"description" text,
	"tax_rate" varchar(50),
	"tax_group" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "cost_allocation_templates" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"rules" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_branch_stats" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"customer_id" varchar(255) NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"debt_amount" varchar(50) DEFAULT '0',
	"loyalty_points" varchar(50) DEFAULT '0',
	"prepaid_balance" varchar(50) DEFAULT '0',
	"note" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"name" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"address" text,
	"customer_code" varchar(255),
	"birthday" varchar(50),
	"customer_type" varchar(50),
	"credit_limit" varchar(50),
	"debt_amount" varchar(50),
	"loyalty_points" varchar(50),
	"prepaid_balance" varchar(50) DEFAULT '0',
	"note" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"warehouse_id" varchar(255),
	"manager_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"type" varchar(50),
	"value" varchar(50),
	"min_qty" varchar(50),
	"min_order_value" varchar(50),
	"applicable_type" varchar(50),
	"applicable_ref" varchar(255),
	"start_date" varchar(50),
	"end_date" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"employee_code" varchar(255),
	"name" varchar(255),
	"phone" varchar(50),
	"role" varchar(50),
	"branch_id" varchar(255),
	"commission_pct" varchar(50),
	"hire_date" varchar(50),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "fund_audits" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"fund_id" varchar(255) NOT NULL,
	"audited_by" varchar(255) NOT NULL,
	"audited_at" varchar(50) NOT NULL,
	"system_balance" varchar(50) NOT NULL,
	"actual_balance" varchar(50) NOT NULL,
	"variance" varchar(50) NOT NULL,
	"cash_denominations" text,
	"status" varchar(50) DEFAULT 'draft',
	"note" text
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_note_items" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"grn_id" varchar(255),
	"product_id" varchar(255),
	"product_name" varchar(255),
	"qty_ordered" varchar(50),
	"qty_received" varchar(50),
	"unit_cost" varchar(50),
	"line_total" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_notes" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"grn_no" varchar(255),
	"purchase_order_id" varchar(255),
	"received_by" varchar(255),
	"warehouse_id" varchar(255),
	"status" varchar(50),
	"branch_id" varchar(255),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "housekeeping_logs" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"employee_id" varchar(255),
	"status" varchar(50),
	"check_type" varchar(50),
	"consumption_details" text,
	"topup_status" varchar(50),
	"note" text,
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255),
	"sku" varchar(255),
	"variant_id" varchar(255),
	"branch_id" varchar(255),
	"warehouse_id" varchar(255),
	"stock_qty" varchar(50),
	"min_stock" varchar(50),
	"unit_cost" varchar(50),
	"last_received_at" varchar(50),
	"last_updated" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"batch_no" varchar(255) NOT NULL,
	"expiry_date" varchar(50) NOT NULL,
	"stock_qty" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_resources" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"type" varchar(50),
	"status" varchar(50),
	"current_order_id" varchar(255),
	"zone" varchar(255),
	"capacity" varchar(50),
	"hourly_rate" varchar(50),
	"sort_order" varchar(50),
	"branch_id" varchar(255),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "minibar_setup" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"standard_qty" integer DEFAULT 0 NOT NULL,
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"order_id" varchar(255),
	"order_no" varchar(255),
	"branch_id" varchar(255),
	"line_no" varchar(50),
	"product_id" varchar(255),
	"sku" varchar(255),
	"variant_id" varchar(255),
	"product_name" varchar(255),
	"qty" varchar(50),
	"unit_price" varchar(50),
	"discount_pct" varchar(50),
	"line_discount" varchar(50),
	"tax_rate" varchar(50),
	"tax_amount" varchar(50),
	"tax_group" varchar(255),
	"tax_vat_rate" varchar(50),
	"tax_pit_rate" varchar(50),
	"line_total" varchar(50),
	"employee_id" varchar(255),
	"unit_id" varchar(255),
	"unit_name" varchar(50),
	"conversion_rate" varchar(50) DEFAULT '1',
	"variant_label" varchar(500),
	"modifiers" text,
	"modifier_total" varchar(50) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"order_no" varchar(255),
	"status" varchar(50),
	"customer_id" varchar(255),
	"customer_name" varchar(255),
	"branch_id" varchar(255),
	"employee_id" varchar(255),
	"channel" varchar(50),
	"subtotal" varchar(50),
	"discount_amount" varchar(50),
	"shipping_fee" varchar(50),
	"tax_amount" varchar(50),
	"total_amount" varchar(50),
	"paid_amount" varchar(50),
	"debt_amount" varchar(50),
	"is_return" varchar(10),
	"original_order_id" varchar(255),
	"points_earned" varchar(50),
	"points_redeemed" varchar(50),
	"note" text,
	"payment_method" varchar(50),
	"reference_no" varchar(255),
	"print_count" varchar(10),
	"resource_id" varchar(255),
	"booking_channel_id" varchar(255),
	"parent_order_id" varchar(255),
	"group_booking_id" varchar(255),
	"override_reason" text,
	"shift_id" varchar(255),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "ota_bookings" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"agency_id" varchar(255) NOT NULL,
	"booking_code" varchar(255),
	"payment_flow" varchar(50),
	"gross_amount" varchar(50),
	"commission_rate" varchar(50),
	"commission_amount" varchar(50),
	"net_payout" varchar(50),
	"reconciliation_status" varchar(50),
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "payment_funds" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"account_number" varchar(100),
	"bank_name" varchar(255),
	"initial_balance" varchar(50) DEFAULT '0',
	"current_balance" varchar(50) DEFAULT '0',
	"is_default" varchar(10) DEFAULT 'FALSE',
	"account_name" varchar(255),
	"qr_template" varchar(50) DEFAULT 'compact2'
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"code" varchar(255) NOT NULL,
	"is_default" varchar(10) DEFAULT 'FALSE'
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"order_id" varchar(255),
	"order_no" varchar(255),
	"branch_id" varchar(255),
	"method" varchar(50),
	"amount" varchar(50),
	"paid_at" varchar(50),
	"cashier_id" varchar(255),
	"reference_no" varchar(255),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255),
	"sku" varchar(255),
	"price_type" varchar(50),
	"sell_price" varchar(50),
	"effective_from" varchar(50),
	"effective_to" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "product_bom" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"parent_product_id" varchar(255) NOT NULL,
	"component_product_id" varchar(255) NOT NULL,
	"qty" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_purchase_history" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255),
	"supplier_id" varchar(255),
	"supplier_name" varchar(255),
	"unit_price" varchar(50),
	"purchased_at" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"unit_name" varchar(50) NOT NULL,
	"conversion_rate" varchar(50) NOT NULL,
	"barcode" varchar(255),
	"sell_price" varchar(50),
	"cost_price" varchar(50),
	"is_base_unit" varchar(10) DEFAULT 'FALSE'
);
--> statement-breakpoint
CREATE TABLE "products" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"name" varchar(255),
	"sku" varchar(255),
	"barcode" varchar(255),
	"category_id" varchar(255),
	"unit" varchar(50),
	"sell_price" varchar(50),
	"cost_price" varchar(50),
	"min_price" varchar(50),
	"tax_rate" varchar(50),
	"input_tax_rate" varchar(50),
	"tax_group" varchar(255),
	"weight" varchar(50),
	"stock_track" varchar(10),
	"variant_id" varchar(255),
	"image_url" text,
	"description" text,
	"stock_qty" varchar(50),
	"metadata" jsonb,
	"has_bom" varchar(10) DEFAULT 'FALSE',
	"item_class" varchar(50) DEFAULT 'commercial',
	"product_type" varchar(20) DEFAULT 'simple',
	"parent_id" varchar(255),
	"variant_options" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"purchase_order_id" varchar(255),
	"product_id" varchar(255),
	"product_name" varchar(255),
	"qty" varchar(50),
	"actual_unit_price" varchar(50),
	"line_total" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"purchase_order_no" varchar(255),
	"requisition_id" varchar(255),
	"supplier_id" varchar(255),
	"supplier_name" varchar(255),
	"purchaser_id" varchar(255),
	"total_amount" varchar(50),
	"status" varchar(50),
	"branch_id" varchar(255),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_items" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"requisition_id" varchar(255),
	"product_id" varchar(255),
	"product_name" varchar(255),
	"qty" varchar(50),
	"estimated_unit_price" varchar(50),
	"line_total" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"requisition_no" varchar(255),
	"status" varchar(50),
	"created_by" varchar(255),
	"estimated_total" varchar(50),
	"note" text,
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "qr_order_requests" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"items" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"reject_reason" text
);
--> statement-breakpoint
CREATE TABLE "qr_ordering_sessions" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "qr_session_carts" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"user_display_name" varchar(255),
	"product_id" varchar(255) NOT NULL,
	"sku" varchar(255),
	"variant_id" varchar(255),
	"product_name" varchar(255),
	"qty" varchar(50) NOT NULL,
	"unit_price" varchar(50) NOT NULL,
	"modifiers" text
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"reservation_no" varchar(255) NOT NULL,
	"branch_id" varchar(255),
	"group_booking_id" varchar(255),
	"customer_id" varchar(255) NOT NULL,
	"customer_name" varchar(255),
	"customer_phone" varchar(50),
	"channel_id" varchar(255) DEFAULT 'direct',
	"ota_booking_code" varchar(255),
	"expected_checkin" timestamp NOT NULL,
	"expected_checkout" timestamp NOT NULL,
	"room_category_id" varchar(255),
	"resource_id" varchar(255),
	"num_guests" integer DEFAULT 1,
	"daily_rate" varchar(50),
	"deposit_amount" varchar(50) DEFAULT '0',
	"deposit_fund_id" varchar(255),
	"status" varchar(50) DEFAULT 'confirmed',
	"note" text,
	"created_by" varchar(255),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "resource_occupants" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"order_id" varchar(255),
	"reservation_id" varchar(255),
	"resource_id" varchar(255) NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_phone" varchar(50),
	"identity_card" varchar(100),
	"nationality" varchar(100) DEFAULT 'Vietnam',
	"birthday" varchar(50),
	"gender" varchar(20),
	"is_primary" varchar(10) DEFAULT 'FALSE',
	"note" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"return_id" varchar(255),
	"return_no" varchar(255),
	"order_item_id" varchar(255),
	"product_id" varchar(255),
	"product_name" varchar(255),
	"sku" varchar(255),
	"qty_returned" varchar(50),
	"unit_price" varchar(50),
	"line_total" varchar(50),
	"unit_id" varchar(255),
	"unit_name" varchar(50),
	"conversion_rate" varchar(50) DEFAULT '1',
	"variant_label" varchar(500),
	"modifiers" text,
	"modifier_total" varchar(50),
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"return_no" varchar(255),
	"order_id" varchar(255),
	"order_no" varchar(255),
	"customer_id" varchar(255),
	"customer_name" varchar(255),
	"reason" varchar(50),
	"status" varchar(50),
	"total_refund" varchar(50),
	"refund_method" varchar(50),
	"processed_by" varchar(255),
	"processed_at" varchar(50),
	"note" text,
	"previous_order_status" varchar(50),
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "room_minibar_stock" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"current_qty" integer DEFAULT 0 NOT NULL,
	"branch_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "sepay_webhook_logs" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255),
	"transaction_id" varchar(255),
	"bank_account" varchar(255),
	"transfer_amount" varchar(50),
	"transfer_type" varchar(50),
	"content" text,
	"gateway" varchar(255),
	"reference_code" varchar(255),
	"status" varchar(50),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "shop_shifts" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"opened_at" varchar(50) NOT NULL,
	"closed_at" varchar(50),
	"status" varchar(50) DEFAULT 'open',
	"opening_cash" varchar(50) DEFAULT '0',
	"expected_closing_cash" varchar(50) DEFAULT '0',
	"actual_closing_cash" varchar(50) DEFAULT '0',
	"cash_variance" varchar(50) DEFAULT '0',
	"non_cash_revenue" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"movement_no" varchar(255),
	"type" varchar(50),
	"product_id" varchar(255),
	"sku" varchar(255),
	"variant_id" varchar(255),
	"qty" varchar(50),
	"unit_cost" varchar(50),
	"branch_id" varchar(255),
	"warehouse_id" varchar(255),
	"to_warehouse_id" varchar(255),
	"supplier_id" varchar(255),
	"reference_no" varchar(255),
	"employee_id" varchar(255),
	"reason" text,
	"batch_no" varchar(255),
	"shipment_no" varchar(255),
	"workflow_status" varchar(50),
	"payment_status" varchar(50),
	"paid_amount" varchar(50),
	"payment_method" varchar(50),
	"discount" varchar(50),
	"payments" jsonb
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"address" text,
	"payment_terms" varchar(255),
	"debt_amount" varchar(50),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "tax_locked_periods" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"period_name" varchar(255) NOT NULL,
	"start_date" varchar(50) NOT NULL,
	"end_date" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'locked',
	"locked_at" varchar(50),
	"locked_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "user_departments" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"department_id" varchar(255) NOT NULL,
	"is_manager" varchar(10) DEFAULT 'FALSE'
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"tenant_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"active" varchar(10) DEFAULT 'TRUE',
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"branch_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) DEFAULT 'custom'
);
--> statement-breakpoint
CREATE INDEX "idx_alloc_tenant" ON "asset_allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_deprec_tenant_asset" ON "asset_depreciations" USING btree ("tenant_id","asset_id");--> statement-breakpoint
CREATE INDEX "idx_asset_tenant_branch" ON "assets" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_cat_tenant_branch" ON "cost_allocation_templates" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_cbs_branch" ON "customer_branch_stats" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_cbs_customer_branch" ON "customer_branch_stats" USING btree ("customer_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_dept_tenant_branch" ON "departments" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_gri_grn_tenant" ON "goods_receipt_note_items" USING btree ("grn_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_grn_tenant_branch" ON "goods_receipt_notes" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_pph_prod_tenant" ON "product_purchase_history" USING btree ("product_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_poi_po_tenant" ON "purchase_order_items" USING btree ("purchase_order_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_po_tenant_branch" ON "purchase_orders" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_pri_req_tenant" ON "purchase_requisition_items" USING btree ("requisition_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pr_tenant_branch" ON "purchase_requisitions" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_sepay_log_tenant_branch" ON "sepay_webhook_logs" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "idx_ud_tenant_user" ON "user_departments" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_wh_tenant_branch" ON "warehouses" USING btree ("tenant_id","branch_id");