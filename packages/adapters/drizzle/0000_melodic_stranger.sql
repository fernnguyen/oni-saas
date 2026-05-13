CREATE TABLE `cashbook` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`type` varchar(50),
	`amount` varchar(50),
	`category` varchar(255),
	`reference_id` varchar(255),
	`note` text,
	`date` varchar(50),
	CONSTRAINT `cashbook_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`parent_id` varchar(255),
	`sort_order` varchar(50),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`name` varchar(255),
	`phone` varchar(50),
	`email` varchar(255),
	`address` text,
	`debt_balance` varchar(50),
	`points` varchar(50),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discounts` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`type` varchar(50),
	`value` varchar(50),
	`min_qty` varchar(50),
	`min_order_value` varchar(50),
	`applicable_type` varchar(50),
	`applicable_ref` varchar(255),
	`start_date` varchar(50),
	`end_date` varchar(50),
	CONSTRAINT `discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`employee_code` varchar(255),
	`name` varchar(255),
	`phone` varchar(50),
	`role` varchar(50),
	`branch_id` varchar(255),
	`commission_pct` varchar(50),
	`hire_date` varchar(50),
	`note` text,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`product_id` varchar(255),
	`sku` varchar(255),
	`variant_id` varchar(255),
	`branch_id` varchar(255),
	`stock_qty` varchar(50),
	`min_stock` varchar(50),
	`unit_cost` varchar(50),
	`last_received_at` varchar(50),
	`last_updated` varchar(50),
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`order_id` varchar(255),
	`order_no` varchar(255),
	`branch_id` varchar(255),
	`line_no` varchar(50),
	`product_id` varchar(255),
	`sku` varchar(255),
	`variant_id` varchar(255),
	`product_name` varchar(255),
	`qty` varchar(50),
	`unit_price` varchar(50),
	`discount_pct` varchar(50),
	`line_discount` varchar(50),
	`tax_rate` varchar(50),
	`tax_amount` varchar(50),
	`line_total` varchar(50),
	`employee_id` varchar(255),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`order_no` varchar(255),
	`status` varchar(50),
	`customer_id` varchar(255),
	`customer_name` varchar(255),
	`branch_id` varchar(255),
	`employee_id` varchar(255),
	`channel` varchar(50),
	`subtotal` varchar(50),
	`discount_amount` varchar(50),
	`shipping_fee` varchar(50),
	`tax_amount` varchar(50),
	`total_amount` varchar(50),
	`paid_amount` varchar(50),
	`debt_amount` varchar(50),
	`is_return` varchar(10),
	`original_order_id` varchar(255),
	`points_earned` varchar(50),
	`points_redeemed` varchar(50),
	`note` text,
	`payment_method` varchar(50),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`order_id` varchar(255),
	`order_no` varchar(255),
	`branch_id` varchar(255),
	`method` varchar(50),
	`amount` varchar(50),
	`paid_at` varchar(50),
	`cashier_id` varchar(255),
	`reference_no` varchar(255),
	`note` text,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_lists` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`product_id` varchar(255),
	`sku` varchar(255),
	`price_type` varchar(50),
	`sell_price` varchar(50),
	`effective_from` varchar(50),
	`effective_to` varchar(50),
	CONSTRAINT `price_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`branch_id` varchar(255),
	`name` varchar(255),
	`sku` varchar(255),
	`barcode` varchar(255),
	`category_id` varchar(255),
	`price` varchar(50),
	`cost` varchar(50),
	`stock_qty` varchar(50),
	`unit` varchar(50),
	`description` text,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`movement_no` varchar(255),
	`type` varchar(50),
	`product_id` varchar(255),
	`sku` varchar(255),
	`variant_id` varchar(255),
	`qty` varchar(50),
	`unit_cost` varchar(50),
	`branch_id` varchar(255),
	`supplier_id` varchar(255),
	`reference_no` varchar(255),
	`employee_id` varchar(255),
	`reason` text,
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
