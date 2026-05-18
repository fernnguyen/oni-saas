CREATE TABLE `location_resources` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`type` varchar(50),
	`status` varchar(50),
	`current_order_id` varchar(255),
	`zone` varchar(255),
	`capacity` varchar(50),
	`hourly_rate` varchar(50),
	`sort_order` varchar(50),
	`branch_id` varchar(255),
	`metadata` text,
	CONSTRAINT `location_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `return_items` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`return_id` varchar(255),
	`return_no` varchar(255),
	`order_item_id` varchar(255),
	`product_id` varchar(255),
	`product_name` varchar(255),
	`sku` varchar(255),
	`qty_returned` varchar(50),
	`unit_price` varchar(50),
	`line_total` varchar(50),
	`branch_id` varchar(255),
	CONSTRAINT `return_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`return_no` varchar(255),
	`order_id` varchar(255),
	`order_no` varchar(255),
	`customer_id` varchar(255),
	`customer_name` varchar(255),
	`reason` varchar(50),
	`status` varchar(50),
	`total_refund` varchar(50),
	`refund_method` varchar(50),
	`processed_by` varchar(255),
	`processed_at` varchar(50),
	`note` text,
	`previous_order_status` varchar(50),
	`branch_id` varchar(255),
	CONSTRAINT `returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`tenant_id` varchar(255) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`active` varchar(10) DEFAULT 'TRUE',
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`phone` varchar(50),
	`email` varchar(255),
	`address` text,
	`payment_terms` varchar(255),
	`debt_amount` varchar(50),
	`note` text,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cashbook` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `cashbook` ADD `method` varchar(50);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `reference_name` varchar(255);--> statement-breakpoint
ALTER TABLE `cashbook` ADD `employee_id` varchar(255);--> statement-breakpoint
ALTER TABLE `categories` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `categories` ADD `description` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `customers` ADD `customer_code` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `birthday` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `customer_type` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `credit_limit` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `debt_amount` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `loyalty_points` varchar(50);--> statement-breakpoint
ALTER TABLE `customers` ADD `note` text;--> statement-breakpoint
ALTER TABLE `discounts` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `employees` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `inventory` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `order_items` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `orders` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `orders` ADD `reference_no` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `print_count` varchar(10);--> statement-breakpoint
ALTER TABLE `orders` ADD `resource_id` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `payments` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `price_lists` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `products` ADD `sell_price` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `cost_price` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `min_price` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `tax_rate` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `weight` varchar(50);--> statement-breakpoint
ALTER TABLE `products` ADD `stock_track` varchar(10);--> statement-breakpoint
ALTER TABLE `products` ADD `variant_id` varchar(255);--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `metadata` text;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `batch_no` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `shipment_no` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `workflow_status` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `payment_status` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `paid_amount` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `payment_method` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `discount` varchar(50);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `payments` json;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `debt_balance`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `points`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `price`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `cost`;