CREATE TABLE `asset_allocations` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`asset_id` varchar(255) NOT NULL,
	`department_id` varchar(255) NOT NULL,
	`department_code` varchar(50),
	`qty` varchar(50) NOT NULL,
	`allocated_at` varchar(50) NOT NULL,
	`note` text,
	`recipient_name` varchar(255),
	`created_by` varchar(255),
	`updated_by` varchar(255),
	CONSTRAINT `asset_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `asset_depreciations` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`asset_id` varchar(255) NOT NULL,
	`depreciation_date` varchar(50) NOT NULL,
	`amount` varchar(50) NOT NULL,
	`depreciated_value_before` varchar(50) DEFAULT '0',
	`depreciated_value_after` varchar(50) DEFAULT '0',
	`department_id` varchar(255) NOT NULL,
	`department_code` varchar(50),
	`cashbook_id` varchar(255),
	`created_by` varchar(255),
	`updated_by` varchar(255),
	CONSTRAINT `asset_depreciations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`name` varchar(255) NOT NULL,
	`unit` varchar(50) NOT NULL,
	`type` varchar(50) NOT NULL,
	`original_value` varchar(50) NOT NULL,
	`salvage_value` varchar(50) DEFAULT '0',
	`purchase_date` varchar(50) NOT NULL,
	`depreciation_months` varchar(50) NOT NULL,
	`depreciated_value` varchar(50) DEFAULT '0',
	`status` varchar(50) DEFAULT 'active',
	`serial_no` varchar(255),
	`manufacturer` varchar(255),
	`warranty_expiry` varchar(50),
	`supplier_id` varchar(255),
	`created_by` varchar(255),
	`updated_by` varchar(255),
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `booking_channels` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(100),
	`commission_rate` varchar(50) DEFAULT '0',
	`color` varchar(50) DEFAULT '#3b82f6',
	`notes` text,
	`branch_id` varchar(255),
	CONSTRAINT `booking_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_allocation_templates` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`rules` text NOT NULL,
	CONSTRAINT `cost_allocation_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_branch_stats` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`customer_id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`debt_amount` varchar(50) DEFAULT '0',
	`loyalty_points` varchar(50) DEFAULT '0',
	`prepaid_balance` varchar(50) DEFAULT '0',
	`note` text,
	CONSTRAINT `customer_branch_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`warehouse_id` varchar(255),
	`manager_id` varchar(255),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fund_audits` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`fund_id` varchar(255) NOT NULL,
	`audited_by` varchar(255) NOT NULL,
	`audited_at` varchar(50) NOT NULL,
	`system_balance` varchar(50) NOT NULL,
	`actual_balance` varchar(50) NOT NULL,
	`variance` varchar(50) NOT NULL,
	`cash_denominations` text,
	`status` varchar(50) DEFAULT 'draft',
	`note` text,
	CONSTRAINT `fund_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_note_items` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`grn_id` varchar(255),
	`product_id` varchar(255),
	`product_name` varchar(255),
	`qty_ordered` varchar(50),
	`qty_received` varchar(50),
	`unit_cost` varchar(50),
	`line_total` varchar(50),
	CONSTRAINT `goods_receipt_note_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_notes` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`grn_no` varchar(255),
	`purchase_order_id` varchar(255),
	`received_by` varchar(255),
	`warehouse_id` varchar(255),
	`status` varchar(50),
	`branch_id` varchar(255),
	`note` text,
	CONSTRAINT `goods_receipt_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `housekeeping_logs` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`resource_id` varchar(255) NOT NULL,
	`employee_id` varchar(255),
	`status` varchar(50),
	`check_type` varchar(50),
	`consumption_details` text,
	`topup_status` varchar(50),
	`note` text,
	`branch_id` varchar(255),
	CONSTRAINT `housekeeping_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minibar_setup` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`resource_id` varchar(255) NOT NULL,
	`product_id` varchar(255) NOT NULL,
	`standard_qty` int NOT NULL DEFAULT 0,
	`branch_id` varchar(255),
	CONSTRAINT `minibar_setup_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ota_bookings` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`order_id` varchar(255) NOT NULL,
	`agency_id` varchar(255) NOT NULL,
	`booking_code` varchar(255),
	`payment_flow` varchar(50),
	`gross_amount` varchar(50),
	`commission_rate` varchar(50),
	`commission_amount` varchar(50),
	`net_payout` varchar(50),
	`reconciliation_status` varchar(50),
	`branch_id` varchar(255),
	CONSTRAINT `ota_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_funds` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL,
	`account_number` varchar(100),
	`account_name` varchar(255),
	`bank_name` varchar(255),
	`initial_balance` varchar(50) DEFAULT '0',
	`current_balance` varchar(50) DEFAULT '0',
	`is_default` varchar(10) DEFAULT 'FALSE',
	`qr_template` varchar(50) DEFAULT 'compact2',
	CONSTRAINT `payment_funds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL,
	`code` varchar(255) NOT NULL,
	`is_default` varchar(10) DEFAULT 'FALSE',
	CONSTRAINT `payment_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_bom` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`parent_product_id` varchar(255) NOT NULL,
	`component_product_id` varchar(255) NOT NULL,
	`qty` varchar(50) NOT NULL,
	CONSTRAINT `product_bom_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_purchase_history` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`product_id` varchar(255),
	`supplier_id` varchar(255),
	`supplier_name` varchar(255),
	`unit_price` varchar(50),
	`purchased_at` varchar(50),
	CONSTRAINT `product_purchase_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`purchase_order_id` varchar(255),
	`product_id` varchar(255),
	`product_name` varchar(255),
	`qty` varchar(50),
	`actual_unit_price` varchar(50),
	`line_total` varchar(50),
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`purchase_order_no` varchar(255),
	`requisition_id` varchar(255),
	`supplier_id` varchar(255),
	`supplier_name` varchar(255),
	`purchaser_id` varchar(255),
	`total_amount` varchar(50),
	`status` varchar(50),
	`branch_id` varchar(255),
	`note` text,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_requisition_items` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`requisition_id` varchar(255),
	`product_id` varchar(255),
	`product_name` varchar(255),
	`qty` varchar(50),
	`estimated_unit_price` varchar(50),
	`line_total` varchar(50),
	CONSTRAINT `purchase_requisition_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_requisitions` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`requisition_no` varchar(255),
	`status` varchar(50),
	`created_by` varchar(255),
	`estimated_total` varchar(50),
	`note` text,
	`branch_id` varchar(255),
	CONSTRAINT `purchase_requisitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qr_order_requests` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`resource_id` varchar(255) NOT NULL,
	`items` json NOT NULL,
	`status` varchar(50) DEFAULT 'pending',
	`reject_reason` text,
	CONSTRAINT `qr_order_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qr_ordering_sessions` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`resource_id` varchar(255) NOT NULL,
	`session_token` varchar(255) NOT NULL,
	`status` varchar(50) DEFAULT 'active',
	CONSTRAINT `qr_ordering_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qr_session_carts` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`user_display_name` varchar(255),
	`product_id` varchar(255) NOT NULL,
	`sku` varchar(255),
	`variant_id` varchar(255),
	`product_name` varchar(255),
	`qty` varchar(50) NOT NULL,
	`unit_price` varchar(50) NOT NULL,
	`modifiers` text,
	CONSTRAINT `qr_session_carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`reservation_no` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`group_booking_id` varchar(255),
	`customer_id` varchar(255) NOT NULL,
	`customer_name` varchar(255),
	`customer_phone` varchar(50),
	`channel_id` varchar(255) DEFAULT 'direct',
	`ota_booking_code` varchar(255),
	`expected_checkin` timestamp NOT NULL,
	`expected_checkout` timestamp NOT NULL,
	`room_category_id` varchar(255),
	`resource_id` varchar(255),
	`num_guests` int DEFAULT 1,
	`daily_rate` varchar(50),
	`deposit_amount` varchar(50) DEFAULT '0',
	`deposit_fund_id` varchar(255),
	`status` varchar(50) DEFAULT 'confirmed',
	`note` text,
	`created_by` varchar(255),
	`metadata` json,
	CONSTRAINT `reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_occupants` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`order_id` varchar(255),
	`reservation_id` varchar(255),
	`resource_id` varchar(255) NOT NULL,
	`guest_name` varchar(255) NOT NULL,
	`guest_phone` varchar(50),
	`identity_card` varchar(100),
	`nationality` varchar(100) DEFAULT 'Vietnam',
	`birthday` varchar(50),
	`gender` varchar(20),
	`is_primary` varchar(10) DEFAULT 'FALSE',
	`note` text,
	`metadata` json,
	CONSTRAINT `resource_occupants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `room_minibar_stock` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`resource_id` varchar(255) NOT NULL,
	`product_id` varchar(255) NOT NULL,
	`current_qty` int NOT NULL DEFAULT 0,
	`branch_id` varchar(255),
	CONSTRAINT `room_minibar_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sepay_webhook_logs` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`transaction_id` varchar(255),
	`bank_account` varchar(255),
	`transfer_amount` varchar(50),
	`transfer_type` varchar(50),
	`content` text,
	`gateway` varchar(255),
	`reference_code` varchar(255),
	`status` varchar(50),
	`error_message` text,
	CONSTRAINT `sepay_webhook_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shop_shifts` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`opened_at` varchar(50) NOT NULL,
	`closed_at` varchar(50),
	`status` varchar(50) DEFAULT 'open',
	`opening_cash` varchar(50) DEFAULT '0',
	`expected_closing_cash` varchar(50) DEFAULT '0',
	`actual_closing_cash` varchar(50) DEFAULT '0',
	`cash_variance` varchar(50) DEFAULT '0',
	`non_cash_revenue` text,
	`note` text,
	CONSTRAINT `shop_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_locked_periods` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`period_name` varchar(255) NOT NULL,
	`start_date` varchar(50) NOT NULL,
	`end_date` varchar(50) NOT NULL,
	`status` varchar(50) DEFAULT 'locked',
	`locked_at` varchar(50),
	`locked_by` varchar(255),
	CONSTRAINT `tax_locked_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_departments` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`department_id` varchar(255) NOT NULL,
	`is_manager` varchar(10) DEFAULT 'FALSE',
	CONSTRAINT `user_departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(50) DEFAULT 'custom',
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cashbook` ADD `fund_id` varchar(255);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `balance_after_transaction` varchar(50);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `department_code` varchar(50);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `department_id` varchar(255);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `parent_transaction_id` varchar(255);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `is_virtual` varchar(10) DEFAULT 'FALSE';--> statement-breakpoint
ALTER TABLE `categories` ADD `tax_rate` varchar(50);--> statement-breakpoint
ALTER TABLE `categories` ADD `tax_group` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `prepaid_balance` varchar(50) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `inventory` ADD `warehouse_id` varchar(255);--> statement-breakpoint
ALTER TABLE `order_items` ADD `tax_group` varchar(255);--> statement-breakpoint
ALTER TABLE `order_items` ADD `tax_vat_rate` varchar(50);--> statement-breakpoint
ALTER TABLE `order_items` ADD `tax_pit_rate` varchar(50);--> statement-breakpoint
ALTER TABLE `order_items` ADD `variant_label` varchar(500);--> statement-breakpoint
ALTER TABLE `order_items` ADD `modifiers` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `modifier_total` varchar(50) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `orders` ADD `booking_channel_id` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `parent_order_id` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `group_booking_id` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `override_reason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shift_id` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `input_tax_rate` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `tax_group` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `has_bom` varchar(10) DEFAULT 'FALSE';--> statement-breakpoint
ALTER TABLE `products` ADD `item_class` varchar(50) DEFAULT 'commercial';--> statement-breakpoint
ALTER TABLE `products` ADD `product_type` varchar(20) DEFAULT 'simple';--> statement-breakpoint
ALTER TABLE `products` ADD `parent_id` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `variant_options` text;--> statement-breakpoint
ALTER TABLE `return_items` ADD `variant_label` varchar(500);--> statement-breakpoint
ALTER TABLE `return_items` ADD `modifiers` text;--> statement-breakpoint
ALTER TABLE `return_items` ADD `modifier_total` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `warehouse_id` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `to_warehouse_id` varchar(255);--> statement-breakpoint
CREATE INDEX `idx_cbs_branch` ON `customer_branch_stats` (`branch_id`);--> statement-breakpoint
CREATE INDEX `idx_cbs_customer_branch` ON `customer_branch_stats` (`customer_id`,`branch_id`);