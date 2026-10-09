-- Brew Houze café database, 1 of 3: the structure
-- Exported 2026-10-06 by deploy-tools/export-cafe-database.mjs
-- Run in the SQL editor of the new Supabase project, after the files before it

BEGIN;

-- Extensions (Supabase projects already have these, this makes sure)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- Number sequences (the ID counters)
CREATE SEQUENCE IF NOT EXISTS public."additions_addition_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."admin_users_admin_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."ai_insights_insight_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."cash_movements_movement_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."counter_carts_counter_cart_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."customer_addresses_address_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."customer_login_failures_failure_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."customer_password_resets_reset_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."customer_sessions_session_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."customers_customer_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."deliveries_delivery_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."delivery_zones_zone_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."discount_types_discount_type_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."employee_time_logs_time_log_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."expenses_expense_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."id_verifications_verification_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."inventory_inventory_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."inventory_log_log_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."inventory_packaging_packaging_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."login_challenges_challenge_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."loyalty_birthday_claims_birthday_claim_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."loyalty_campaigns_campaign_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."loyalty_claims_claim_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."loyalty_rewards_reward_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."loyalty_star_entries_entry_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."order_discounts_order_discount_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."password_reset_tokens_token_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."payment_checkouts_checkout_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."product_categories_category_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."product_ingredients_product_ingredient_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."product_variants_product_variant_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."products_product_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."quick_requests_request_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."sales_order_item_additions_order_item_addition_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."sales_order_items_order_item_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."sales_orders_order_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."shifts_shift_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."treasury_accounts_account_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."treasury_entries_entry_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."trusted_devices_trusted_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."user_sessions_session_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."variant_ingredients_variant_ingredient_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public."write_off_requests_request_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;

-- Tables
CREATE TABLE public."addition_categories" (
  "addition_id" integer NOT NULL,
  "category_id" integer NOT NULL
);
CREATE TABLE public."additions" (
  "addition_id" integer NOT NULL,
  "addition_name" text NOT NULL,
  "inventory_id" integer NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "is_active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "station" text NOT NULL
);
CREATE TABLE public."admin_users" (
  "admin_id" integer NOT NULL,
  "full_name" character varying(120) NOT NULL,
  "email" character varying(255) NOT NULL,
  "password_hash" text NOT NULL,
  "role" character varying(30) NOT NULL,
  "is_active" boolean NOT NULL,
  "created_at" timestamp without time zone NOT NULL,
  "updated_at" timestamp without time zone NOT NULL,
  "can_void_orders" boolean NOT NULL,
  "can_refund_orders" boolean NOT NULL,
  "can_open_shift" boolean NOT NULL,
  "can_close_shift" boolean NOT NULL
);
CREATE TABLE public."ai_insights" (
  "insight_id" integer NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "facts" jsonb NOT NULL,
  "cards" jsonb NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "requested_by" integer,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."cash_movements" (
  "movement_id" integer NOT NULL,
  "shift_id" integer NOT NULL,
  "kind" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "reason" text NOT NULL,
  "note" text,
  "admin_id" integer,
  "source_app" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."counter_carts" (
  "counter_cart_id" integer NOT NULL,
  "public_token" text NOT NULL,
  "short_code" text NOT NULL,
  "items" jsonb NOT NULL,
  "customer_id" integer,
  "discount_type_id" integer,
  "service_type" text,
  "status" text NOT NULL,
  "order_id" integer,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."customer_addresses" (
  "address_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "label" text NOT NULL,
  "recipient_name" text NOT NULL,
  "phone" text NOT NULL,
  "zone_id" integer,
  "street" text NOT NULL,
  "landmark" text,
  "rider_notes" text,
  "is_default" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."customer_login_failures" (
  "failure_id" integer NOT NULL,
  "username_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."customer_password_resets" (
  "reset_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone
);
CREATE TABLE public."customer_sessions" (
  "session_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "device_label" text,
  "created_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "end_reason" text
);
CREATE TABLE public."customers" (
  "customer_id" integer NOT NULL,
  "username" character varying(30),
  "full_name" character varying(120) NOT NULL,
  "email" character varying(254),
  "password_hash" text,
  "birthday" date,
  "notes" text,
  "is_active" boolean NOT NULL,
  "created_by_admin_id" integer,
  "consented_at" timestamp with time zone,
  "consent_version" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "id_discount_type_id" integer,
  "id_discount_name" text,
  "id_discount_number" text,
  "id_verified_at" timestamp with time zone,
  "id_verified_by" integer,
  "phone" text,
  "cod_blocked" boolean NOT NULL,
  "cod_block_reason" text
);
CREATE TABLE public."deliveries" (
  "delivery_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "customer_id" integer,
  "address_id" integer,
  "recipient_name" text NOT NULL,
  "phone" text NOT NULL,
  "street" text NOT NULL,
  "landmark" text,
  "rider_notes" text,
  "zone_id" integer,
  "zone_name" text NOT NULL,
  "fee" numeric(10,2) NOT NULL,
  "payment" text NOT NULL,
  "status" text NOT NULL,
  "check_id" boolean NOT NULL,
  "rider_admin_id" integer,
  "ready_at" timestamp with time zone,
  "picked_up_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "failure_reason" text,
  "cod_amount" numeric(10,2),
  "cod_collected" numeric(10,2),
  "cod_remitted_at" timestamp with time zone,
  "cod_remitted_to" integer,
  "cod_remitted_shift_id" integer,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."delivery_zones" (
  "zone_id" integer NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "fee" numeric(10,2) NOT NULL,
  "min_order" numeric(10,2),
  "is_active" boolean NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."discount_types" (
  "discount_type_id" integer NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "discount_kind" text NOT NULL,
  "discount_value" numeric(10,2) NOT NULL,
  "max_discount" numeric(10,2),
  "vat_exempt" boolean NOT NULL,
  "requires_id" boolean NOT NULL,
  "id_label" text,
  "is_active" boolean NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."employee_time_logs" (
  "time_log_id" bigint NOT NULL,
  "admin_id" integer NOT NULL,
  "time_in" timestamp with time zone NOT NULL,
  "time_out" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "shift_id" integer
);
CREATE TABLE public."expenses" (
  "expense_id" integer NOT NULL,
  "spent_on" date NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "paid_from" text NOT NULL,
  "shift_id" integer,
  "movement_id" integer,
  "entry_id" integer,
  "reference" text,
  "note" text,
  "admin_id" integer,
  "source_app" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "voided_at" timestamp with time zone,
  "voided_by" integer,
  "void_reason" text
);
CREATE TABLE public."id_verifications" (
  "verification_id" integer NOT NULL,
  "public_token" text NOT NULL,
  "customer_id" integer,
  "discount_type_id" integer,
  "holder_name" text NOT NULL,
  "id_number" text,
  "items" jsonb NOT NULL,
  "lines" jsonb,
  "group_size" integer,
  "service_type" text,
  "photo" bytea,
  "photo_type" text,
  "remember" boolean NOT NULL,
  "status" text NOT NULL,
  "reject_reason" text,
  "decided_by" integer,
  "decided_at" timestamp with time zone,
  "order_id" integer,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."inventory" (
  "inventory_id" integer NOT NULL,
  "ingredient_category" character varying(100) NOT NULL,
  "item_name" character varying(150) NOT NULL,
  "unit_of_measure" character varying(50) NOT NULL,
  "quantity" numeric(10,2) NOT NULL,
  "created_at" timestamp without time zone,
  "updated_at" timestamp without time zone,
  "low_stock_threshold" numeric NOT NULL,
  "is_whole_unit" boolean NOT NULL,
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "derived_from_inventory_id" integer,
  "derived_ratio" numeric(12,4),
  "unit_cost" numeric(12,4),
  "is_customizable" boolean NOT NULL
);
CREATE TABLE public."inventory_log" (
  "log_id" bigint NOT NULL,
  "inventory_id" integer,
  "item_name" text NOT NULL,
  "ingredient_category" text NOT NULL,
  "unit_of_measure" text NOT NULL,
  "change_type" text NOT NULL,
  "quantity_before" numeric NOT NULL,
  "quantity_after" numeric NOT NULL,
  "quantity_delta" numeric NOT NULL,
  "order_id" integer,
  "admin_id" integer,
  "source_app" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL,
  "unit_cost_before" numeric(12,4),
  "unit_cost_after" numeric(12,4),
  "shift_id" integer,
  "packaging_id" integer,
  "packaging_name" text,
  "packs_added" integer,
  "pack_price" numeric(12,2),
  "write_off_reason" text,
  "write_off_cost" numeric(12,2),
  "write_off_request_id" integer
);
CREATE TABLE public."inventory_packaging" (
  "packaging_id" integer NOT NULL,
  "inventory_id" integer NOT NULL,
  "packaging_name" text NOT NULL,
  "brand" text,
  "content_quantity" numeric(14,4) NOT NULL,
  "last_pack_price" numeric(12,2),
  "last_restocked_at" timestamp with time zone,
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."login_challenges" (
  "challenge_id" integer NOT NULL,
  "account_kind" text NOT NULL,
  "account_id" integer NOT NULL,
  "portal" text NOT NULL,
  "token_hash" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL,
  "sends" integer NOT NULL,
  "last_sent_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."loyalty_birthday_claims" (
  "birthday_claim_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "campaign_id" integer NOT NULL,
  "reward_id" integer,
  "order_id" integer,
  "claim_year" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "returned_at" timestamp with time zone
);
CREATE TABLE public."loyalty_campaigns" (
  "campaign_id" integer NOT NULL,
  "name" character varying(80) NOT NULL,
  "description" text,
  "starts_on" date NOT NULL,
  "ends_on" date,
  "is_active" boolean NOT NULL,
  "earn_mode" text NOT NULL,
  "stars_per_unit" integer NOT NULL,
  "amount_step" numeric(10,2),
  "eligible_categories" text[],
  "max_stars_per_order" integer,
  "max_stars_per_day" integer,
  "carry_over" boolean NOT NULL,
  "created_by_admin_id" integer,
  "activated_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "min_order_amount" numeric(10,2),
  "kind" text NOT NULL,
  "birthday_window" text
);
CREATE TABLE public."loyalty_claims" (
  "claim_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "campaign_id" integer,
  "reward_id" integer,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by_admin_id" integer,
  "order_id" integer,
  "closed_at" timestamp with time zone
);
CREATE TABLE public."loyalty_rewards" (
  "reward_id" integer NOT NULL,
  "campaign_id" integer NOT NULL,
  "name" character varying(80) NOT NULL,
  "stars_cost" integer NOT NULL,
  "product_id" integer,
  "category" text,
  "max_price" numeric(10,2),
  "is_active" boolean NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "reward_type" text NOT NULL,
  "discount_kind" text,
  "discount_value" numeric(10,2),
  "max_discount" numeric(10,2),
  "min_order_amount" numeric(10,2)
);
CREATE TABLE public."loyalty_star_entries" (
  "entry_id" integer NOT NULL,
  "customer_id" integer NOT NULL,
  "campaign_id" integer NOT NULL,
  "kind" text NOT NULL,
  "stars" integer NOT NULL,
  "order_id" integer,
  "reward_id" integer,
  "reason" text,
  "admin_id" integer,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."order_discounts" (
  "order_discount_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "discount_type_id" integer,
  "type_code" text NOT NULL,
  "type_name" text NOT NULL,
  "holder_name" text NOT NULL,
  "id_number" text,
  "coverage" text NOT NULL,
  "group_size" integer,
  "covered_items" jsonb,
  "covered_amount" numeric(10,2) NOT NULL,
  "vat_exempt_amount" numeric(10,2) NOT NULL,
  "discount_amount" numeric(10,2) NOT NULL,
  "recorded_by" integer,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."order_stations" (
  "order_id" integer NOT NULL,
  "station" text NOT NULL,
  "status" text NOT NULL,
  "ready_at" timestamp with time zone,
  "ready_by" integer,
  "picked_up_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."password_reset_tokens" (
  "token_id" integer NOT NULL,
  "admin_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."payment_checkouts" (
  "checkout_id" integer NOT NULL,
  "source_app" text NOT NULL,
  "status" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "items" jsonb NOT NULL,
  "cashier_admin_id" integer,
  "public_token" uuid NOT NULL,
  "intent_id" text,
  "payment_id" text,
  "order_id" integer,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "cash_amount" numeric(10,2) NOT NULL,
  "received_amount" numeric(10,2),
  "customer_id" integer,
  "discount_reward_id" integer,
  "service_type" text,
  "id_discounts" jsonb,
  "counter_cart_id" integer,
  "id_verification_id" integer,
  "delivery" jsonb
);
CREATE TABLE public."product_additions" (
  "product_id" integer NOT NULL,
  "addition_id" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."product_categories" (
  "category_id" integer NOT NULL,
  "category_name" text NOT NULL,
  "is_active" boolean NOT NULL
);
CREATE TABLE public."product_ingredients" (
  "product_ingredient_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "inventory_id" integer NOT NULL,
  "required_quantity" numeric(10,2) NOT NULL
);
CREATE TABLE public."product_variants" (
  "product_variant_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "size_label" character varying(30) NOT NULL,
  "price" numeric(10,2),
  "created_at" timestamp without time zone NOT NULL,
  "updated_at" timestamp without time zone NOT NULL,
  "temperature" character varying(10),
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer
);
CREATE TABLE public."products" (
  "product_id" integer NOT NULL,
  "product_name" character varying(150) NOT NULL,
  "product_category" character varying(100),
  "price" numeric(10,2) NOT NULL,
  "created_at" timestamp without time zone,
  "updated_at" timestamp without time zone,
  "image_url" text,
  "image_data" bytea,
  "image_mime_type" character varying(100),
  "product_description" text NOT NULL,
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "product_type" character varying(20) NOT NULL,
  "is_featured" boolean NOT NULL,
  "badge_label" text,
  "featured_order" integer NOT NULL,
  "station" text NOT NULL
);
CREATE TABLE public."quick_requests" (
  "request_id" integer NOT NULL,
  "request_text" text NOT NULL,
  "station" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."sales_order_item_additions" (
  "order_item_addition_id" integer NOT NULL,
  "order_item_id" integer NOT NULL,
  "addition_id" integer NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit_price" numeric(10,2) NOT NULL,
  "unit_cost" numeric(12,4)
);
CREATE TABLE public."sales_order_items" (
  "order_item_id" integer NOT NULL,
  "order_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "product_variant_id" integer NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" numeric(10,2) NOT NULL,
  "unit_cost" numeric(12,4),
  "reward_id" integer,
  "reward_value" numeric(10,2),
  "station" text,
  "customizations" jsonb,
  "item_note" text
);
CREATE TABLE public."sales_orders" (
  "order_id" integer NOT NULL,
  "cashier_admin_id" integer,
  "total_amount" numeric(10,2) NOT NULL,
  "status" character varying(20) NOT NULL,
  "created_at" timestamp without time zone NOT NULL,
  "queue_number" integer,
  "queue_status" text NOT NULL,
  "served_at" timestamp with time zone,
  "order_source" text NOT NULL,
  "customer_order_token" uuid,
  "reversed_by_admin_id" integer,
  "reversed_at" timestamp with time zone,
  "reversal_type" character varying(20),
  "received_amount" numeric(12,2) NOT NULL,
  "change_amount" numeric(12,2) NOT NULL,
  "payment_method" character varying(20) NOT NULL,
  "is_archived" boolean NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "shift_id" integer,
  "reversed_shift_id" integer,
  "payment_provider" text,
  "payment_reference" text,
  "return_method" text,
  "return_gcash_name" text,
  "return_gcash_number" text,
  "return_reference" text,
  "cash_portion" numeric(10,2),
  "customer_id" integer,
  "subtotal_amount" numeric(10,2),
  "discount_amount" numeric(10,2) NOT NULL,
  "discount_label" text,
  "discount_source" text,
  "discount_reward_id" integer,
  "service_type" text,
  "vat_exempt_amount" numeric(10,2) NOT NULL,
  "delivery_fee" numeric(10,2) NOT NULL,
  "payment_fee" numeric(10,2),
  "reversed_after_made" boolean,
  "wasted_cost" numeric(12,2)
);
CREATE TABLE public."shifts" (
  "shift_id" integer NOT NULL,
  "opened_at" timestamp with time zone NOT NULL,
  "opened_by" integer,
  "starting_cash" numeric(12,2) NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by" integer,
  "expected_cash" numeric(12,2),
  "counted_cash" numeric(12,2),
  "closing_notes" text,
  "is_historical" boolean NOT NULL,
  "carried_float" numeric(12,2),
  "float_kept" numeric(12,2)
);
CREATE TABLE public."store_settings" (
  "setting_key" text NOT NULL,
  "setting_value" text NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."treasury_accounts" (
  "account_id" integer NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "balance" numeric(12,2) NOT NULL,
  "opened_at" timestamp with time zone,
  "is_archived" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."treasury_entries" (
  "entry_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "kind" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "balance_after" numeric(12,2) NOT NULL,
  "shift_id" integer,
  "movement_id" integer,
  "corrects_entry_id" integer,
  "reason" text NOT NULL,
  "note" text,
  "admin_id" integer,
  "source_app" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."trusted_devices" (
  "trusted_id" integer NOT NULL,
  "account_kind" text NOT NULL,
  "account_id" integer NOT NULL,
  "device_hash" text NOT NULL,
  "device_label" text,
  "trusted_until" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone NOT NULL
);
CREATE TABLE public."user_sessions" (
  "session_id" integer NOT NULL,
  "admin_id" integer NOT NULL,
  "app" text NOT NULL,
  "token_hash" text NOT NULL,
  "device_label" text,
  "created_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "end_reason" text
);
CREATE TABLE public."variant_ingredients" (
  "variant_ingredient_id" integer NOT NULL,
  "product_variant_id" integer NOT NULL,
  "inventory_id" integer NOT NULL,
  "required_quantity" numeric NOT NULL
);
CREATE TABLE public."write_off_requests" (
  "request_id" integer NOT NULL,
  "product_variant_id" integer,
  "inventory_id" integer,
  "quantity" numeric(12,3) NOT NULL,
  "label" text NOT NULL,
  "reason" text NOT NULL,
  "note" text,
  "requested_by" integer,
  "shift_id" integer,
  "source_app" text NOT NULL,
  "status" text NOT NULL,
  "decided_by" integer,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "approved_cost" numeric(12,2),
  "created_at" timestamp with time zone NOT NULL
);

-- Functions
CREATE OR REPLACE FUNCTION public.current_open_shift_id()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT shift_id FROM shifts WHERE closed_at IS NULL LIMIT 1$function$;

-- Column defaults
ALTER TABLE public."additions" ALTER COLUMN "addition_id" SET DEFAULT nextval('additions_addition_id_seq'::regclass);
ALTER TABLE public."additions" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."additions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."additions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."additions" ALTER COLUMN "price" SET DEFAULT 0;
ALTER TABLE public."additions" ALTER COLUMN "station" SET DEFAULT 'bar'::text;
ALTER TABLE public."admin_users" ALTER COLUMN "admin_id" SET DEFAULT nextval('admin_users_admin_id_seq'::regclass);
ALTER TABLE public."admin_users" ALTER COLUMN "role" SET DEFAULT 'admin'::character varying;
ALTER TABLE public."admin_users" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."admin_users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."admin_users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."admin_users" ALTER COLUMN "can_void_orders" SET DEFAULT false;
ALTER TABLE public."admin_users" ALTER COLUMN "can_refund_orders" SET DEFAULT false;
ALTER TABLE public."admin_users" ALTER COLUMN "can_open_shift" SET DEFAULT false;
ALTER TABLE public."admin_users" ALTER COLUMN "can_close_shift" SET DEFAULT false;
ALTER TABLE public."ai_insights" ALTER COLUMN "insight_id" SET DEFAULT nextval('ai_insights_insight_id_seq'::regclass);
ALTER TABLE public."ai_insights" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."cash_movements" ALTER COLUMN "movement_id" SET DEFAULT nextval('cash_movements_movement_id_seq'::regclass);
ALTER TABLE public."cash_movements" ALTER COLUMN "source_app" SET DEFAULT 'cashier'::text;
ALTER TABLE public."cash_movements" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."counter_carts" ALTER COLUMN "counter_cart_id" SET DEFAULT nextval('counter_carts_counter_cart_id_seq'::regclass);
ALTER TABLE public."counter_carts" ALTER COLUMN "status" SET DEFAULT 'waiting'::text;
ALTER TABLE public."counter_carts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."counter_carts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_addresses" ALTER COLUMN "address_id" SET DEFAULT nextval('customer_addresses_address_id_seq'::regclass);
ALTER TABLE public."customer_addresses" ALTER COLUMN "label" SET DEFAULT 'Home'::text;
ALTER TABLE public."customer_addresses" ALTER COLUMN "is_default" SET DEFAULT false;
ALTER TABLE public."customer_addresses" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_addresses" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_login_failures" ALTER COLUMN "failure_id" SET DEFAULT nextval('customer_login_failures_failure_id_seq'::regclass);
ALTER TABLE public."customer_login_failures" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_password_resets" ALTER COLUMN "reset_id" SET DEFAULT nextval('customer_password_resets_reset_id_seq'::regclass);
ALTER TABLE public."customer_password_resets" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_sessions" ALTER COLUMN "session_id" SET DEFAULT nextval('customer_sessions_session_id_seq'::regclass);
ALTER TABLE public."customer_sessions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customer_sessions" ALTER COLUMN "last_seen_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customers" ALTER COLUMN "customer_id" SET DEFAULT nextval('customers_customer_id_seq'::regclass);
ALTER TABLE public."customers" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."customers" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."customers" ALTER COLUMN "cod_blocked" SET DEFAULT false;
ALTER TABLE public."deliveries" ALTER COLUMN "delivery_id" SET DEFAULT nextval('deliveries_delivery_id_seq'::regclass);
ALTER TABLE public."deliveries" ALTER COLUMN "fee" SET DEFAULT 0;
ALTER TABLE public."deliveries" ALTER COLUMN "status" SET DEFAULT 'preparing'::text;
ALTER TABLE public."deliveries" ALTER COLUMN "check_id" SET DEFAULT false;
ALTER TABLE public."deliveries" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."deliveries" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."delivery_zones" ALTER COLUMN "zone_id" SET DEFAULT nextval('delivery_zones_zone_id_seq'::regclass);
ALTER TABLE public."delivery_zones" ALTER COLUMN "fee" SET DEFAULT 0;
ALTER TABLE public."delivery_zones" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."delivery_zones" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE public."delivery_zones" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."delivery_zones" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."discount_types" ALTER COLUMN "discount_type_id" SET DEFAULT nextval('discount_types_discount_type_id_seq'::regclass);
ALTER TABLE public."discount_types" ALTER COLUMN "vat_exempt" SET DEFAULT false;
ALTER TABLE public."discount_types" ALTER COLUMN "requires_id" SET DEFAULT true;
ALTER TABLE public."discount_types" ALTER COLUMN "is_active" SET DEFAULT false;
ALTER TABLE public."discount_types" ALTER COLUMN "sort_order" SET DEFAULT 100;
ALTER TABLE public."discount_types" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."discount_types" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."employee_time_logs" ALTER COLUMN "time_log_id" SET DEFAULT nextval('employee_time_logs_time_log_id_seq'::regclass);
ALTER TABLE public."employee_time_logs" ALTER COLUMN "time_in" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."employee_time_logs" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."employee_time_logs" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."employee_time_logs" ALTER COLUMN "shift_id" SET DEFAULT current_open_shift_id();
ALTER TABLE public."expenses" ALTER COLUMN "expense_id" SET DEFAULT nextval('expenses_expense_id_seq'::regclass);
ALTER TABLE public."expenses" ALTER COLUMN "source_app" SET DEFAULT 'admin'::text;
ALTER TABLE public."expenses" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."id_verifications" ALTER COLUMN "verification_id" SET DEFAULT nextval('id_verifications_verification_id_seq'::regclass);
ALTER TABLE public."id_verifications" ALTER COLUMN "remember" SET DEFAULT false;
ALTER TABLE public."id_verifications" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
ALTER TABLE public."id_verifications" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."id_verifications" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."inventory" ALTER COLUMN "inventory_id" SET DEFAULT nextval('inventory_inventory_id_seq'::regclass);
ALTER TABLE public."inventory" ALTER COLUMN "quantity" SET DEFAULT 0;
ALTER TABLE public."inventory" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."inventory" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."inventory" ALTER COLUMN "low_stock_threshold" SET DEFAULT 5;
ALTER TABLE public."inventory" ALTER COLUMN "is_whole_unit" SET DEFAULT false;
ALTER TABLE public."inventory" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."inventory" ALTER COLUMN "is_customizable" SET DEFAULT false;
ALTER TABLE public."inventory_log" ALTER COLUMN "log_id" SET DEFAULT nextval('inventory_log_log_id_seq'::regclass);
ALTER TABLE public."inventory_log" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."inventory_log" ALTER COLUMN "shift_id" SET DEFAULT current_open_shift_id();
ALTER TABLE public."inventory_packaging" ALTER COLUMN "packaging_id" SET DEFAULT nextval('inventory_packaging_packaging_id_seq'::regclass);
ALTER TABLE public."inventory_packaging" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."inventory_packaging" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."inventory_packaging" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."login_challenges" ALTER COLUMN "challenge_id" SET DEFAULT nextval('login_challenges_challenge_id_seq'::regclass);
ALTER TABLE public."login_challenges" ALTER COLUMN "attempts" SET DEFAULT 0;
ALTER TABLE public."login_challenges" ALTER COLUMN "sends" SET DEFAULT 1;
ALTER TABLE public."login_challenges" ALTER COLUMN "last_sent_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."login_challenges" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_birthday_claims" ALTER COLUMN "birthday_claim_id" SET DEFAULT nextval('loyalty_birthday_claims_birthday_claim_id_seq'::regclass);
ALTER TABLE public."loyalty_birthday_claims" ALTER COLUMN "status" SET DEFAULT 'used'::text;
ALTER TABLE public."loyalty_birthday_claims" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "campaign_id" SET DEFAULT nextval('loyalty_campaigns_campaign_id_seq'::regclass);
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "is_active" SET DEFAULT false;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "earn_mode" SET DEFAULT 'per_item'::text;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "stars_per_unit" SET DEFAULT 1;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "carry_over" SET DEFAULT false;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_campaigns" ALTER COLUMN "kind" SET DEFAULT 'seasonal'::text;
ALTER TABLE public."loyalty_claims" ALTER COLUMN "claim_id" SET DEFAULT nextval('loyalty_claims_claim_id_seq'::regclass);
ALTER TABLE public."loyalty_claims" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
ALTER TABLE public."loyalty_claims" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_rewards" ALTER COLUMN "reward_id" SET DEFAULT nextval('loyalty_rewards_reward_id_seq'::regclass);
ALTER TABLE public."loyalty_rewards" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."loyalty_rewards" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE public."loyalty_rewards" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."loyalty_rewards" ALTER COLUMN "reward_type" SET DEFAULT 'free_item'::text;
ALTER TABLE public."loyalty_star_entries" ALTER COLUMN "entry_id" SET DEFAULT nextval('loyalty_star_entries_entry_id_seq'::regclass);
ALTER TABLE public."loyalty_star_entries" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."order_discounts" ALTER COLUMN "order_discount_id" SET DEFAULT nextval('order_discounts_order_discount_id_seq'::regclass);
ALTER TABLE public."order_discounts" ALTER COLUMN "vat_exempt_amount" SET DEFAULT 0;
ALTER TABLE public."order_discounts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."order_stations" ALTER COLUMN "status" SET DEFAULT 'waiting'::text;
ALTER TABLE public."order_stations" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."password_reset_tokens" ALTER COLUMN "token_id" SET DEFAULT nextval('password_reset_tokens_token_id_seq'::regclass);
ALTER TABLE public."password_reset_tokens" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."payment_checkouts" ALTER COLUMN "checkout_id" SET DEFAULT nextval('payment_checkouts_checkout_id_seq'::regclass);
ALTER TABLE public."payment_checkouts" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment'::text;
ALTER TABLE public."payment_checkouts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."payment_checkouts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."payment_checkouts" ALTER COLUMN "cash_amount" SET DEFAULT 0;
ALTER TABLE public."product_additions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."product_categories" ALTER COLUMN "category_id" SET DEFAULT nextval('product_categories_category_id_seq'::regclass);
ALTER TABLE public."product_categories" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE public."product_ingredients" ALTER COLUMN "product_ingredient_id" SET DEFAULT nextval('product_ingredients_product_ingredient_id_seq'::regclass);
ALTER TABLE public."product_ingredients" ALTER COLUMN "required_quantity" SET DEFAULT 1;
ALTER TABLE public."product_variants" ALTER COLUMN "product_variant_id" SET DEFAULT nextval('product_variants_product_variant_id_seq'::regclass);
ALTER TABLE public."product_variants" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."product_variants" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."product_variants" ALTER COLUMN "temperature" SET DEFAULT 'hot'::character varying;
ALTER TABLE public."product_variants" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."products" ALTER COLUMN "product_id" SET DEFAULT nextval('products_product_id_seq'::regclass);
ALTER TABLE public."products" ALTER COLUMN "price" SET DEFAULT 0;
ALTER TABLE public."products" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."products" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."products" ALTER COLUMN "product_description" SET DEFAULT ''::text;
ALTER TABLE public."products" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."products" ALTER COLUMN "product_type" SET DEFAULT 'recipe'::character varying;
ALTER TABLE public."products" ALTER COLUMN "is_featured" SET DEFAULT false;
ALTER TABLE public."products" ALTER COLUMN "featured_order" SET DEFAULT 0;
ALTER TABLE public."products" ALTER COLUMN "station" SET DEFAULT 'bar'::text;
ALTER TABLE public."quick_requests" ALTER COLUMN "request_id" SET DEFAULT nextval('quick_requests_request_id_seq'::regclass);
ALTER TABLE public."quick_requests" ALTER COLUMN "station" SET DEFAULT 'bar'::text;
ALTER TABLE public."quick_requests" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."sales_order_item_additions" ALTER COLUMN "order_item_addition_id" SET DEFAULT nextval('sales_order_item_additions_order_item_addition_id_seq'::regclass);
ALTER TABLE public."sales_order_item_additions" ALTER COLUMN "unit_price" SET DEFAULT 0;
ALTER TABLE public."sales_order_items" ALTER COLUMN "order_item_id" SET DEFAULT nextval('sales_order_items_order_item_id_seq'::regclass);
ALTER TABLE public."sales_orders" ALTER COLUMN "order_id" SET DEFAULT nextval('sales_orders_order_id_seq'::regclass);
ALTER TABLE public."sales_orders" ALTER COLUMN "status" SET DEFAULT 'completed'::character varying;
ALTER TABLE public."sales_orders" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."sales_orders" ALTER COLUMN "queue_status" SET DEFAULT 'waiting'::text;
ALTER TABLE public."sales_orders" ALTER COLUMN "order_source" SET DEFAULT 'cashier'::text;
ALTER TABLE public."sales_orders" ALTER COLUMN "received_amount" SET DEFAULT 0;
ALTER TABLE public."sales_orders" ALTER COLUMN "change_amount" SET DEFAULT 0;
ALTER TABLE public."sales_orders" ALTER COLUMN "payment_method" SET DEFAULT 'cash'::character varying;
ALTER TABLE public."sales_orders" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."sales_orders" ALTER COLUMN "discount_amount" SET DEFAULT 0;
ALTER TABLE public."sales_orders" ALTER COLUMN "vat_exempt_amount" SET DEFAULT 0;
ALTER TABLE public."sales_orders" ALTER COLUMN "delivery_fee" SET DEFAULT 0;
ALTER TABLE public."shifts" ALTER COLUMN "shift_id" SET DEFAULT nextval('shifts_shift_id_seq'::regclass);
ALTER TABLE public."shifts" ALTER COLUMN "opened_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."shifts" ALTER COLUMN "starting_cash" SET DEFAULT 0;
ALTER TABLE public."shifts" ALTER COLUMN "is_historical" SET DEFAULT false;
ALTER TABLE public."store_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."treasury_accounts" ALTER COLUMN "account_id" SET DEFAULT nextval('treasury_accounts_account_id_seq'::regclass);
ALTER TABLE public."treasury_accounts" ALTER COLUMN "balance" SET DEFAULT 0;
ALTER TABLE public."treasury_accounts" ALTER COLUMN "is_archived" SET DEFAULT false;
ALTER TABLE public."treasury_accounts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."treasury_accounts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."treasury_entries" ALTER COLUMN "entry_id" SET DEFAULT nextval('treasury_entries_entry_id_seq'::regclass);
ALTER TABLE public."treasury_entries" ALTER COLUMN "source_app" SET DEFAULT 'admin'::text;
ALTER TABLE public."treasury_entries" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."trusted_devices" ALTER COLUMN "trusted_id" SET DEFAULT nextval('trusted_devices_trusted_id_seq'::regclass);
ALTER TABLE public."trusted_devices" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."trusted_devices" ALTER COLUMN "last_used_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."user_sessions" ALTER COLUMN "session_id" SET DEFAULT nextval('user_sessions_session_id_seq'::regclass);
ALTER TABLE public."user_sessions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."user_sessions" ALTER COLUMN "last_seen_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."variant_ingredients" ALTER COLUMN "variant_ingredient_id" SET DEFAULT nextval('variant_ingredients_variant_ingredient_id_seq'::regclass);
ALTER TABLE public."write_off_requests" ALTER COLUMN "request_id" SET DEFAULT nextval('write_off_requests_request_id_seq'::regclass);
ALTER TABLE public."write_off_requests" ALTER COLUMN "source_app" SET DEFAULT 'cashier'::text;
ALTER TABLE public."write_off_requests" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
ALTER TABLE public."write_off_requests" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Sequences belong to their columns
ALTER SEQUENCE public."additions_addition_id_seq" OWNED BY public."additions"."addition_id";
ALTER SEQUENCE public."admin_users_admin_id_seq" OWNED BY public."admin_users"."admin_id";
ALTER SEQUENCE public."ai_insights_insight_id_seq" OWNED BY public."ai_insights"."insight_id";
ALTER SEQUENCE public."cash_movements_movement_id_seq" OWNED BY public."cash_movements"."movement_id";
ALTER SEQUENCE public."counter_carts_counter_cart_id_seq" OWNED BY public."counter_carts"."counter_cart_id";
ALTER SEQUENCE public."customer_addresses_address_id_seq" OWNED BY public."customer_addresses"."address_id";
ALTER SEQUENCE public."customer_login_failures_failure_id_seq" OWNED BY public."customer_login_failures"."failure_id";
ALTER SEQUENCE public."customer_password_resets_reset_id_seq" OWNED BY public."customer_password_resets"."reset_id";
ALTER SEQUENCE public."customer_sessions_session_id_seq" OWNED BY public."customer_sessions"."session_id";
ALTER SEQUENCE public."customers_customer_id_seq" OWNED BY public."customers"."customer_id";
ALTER SEQUENCE public."deliveries_delivery_id_seq" OWNED BY public."deliveries"."delivery_id";
ALTER SEQUENCE public."delivery_zones_zone_id_seq" OWNED BY public."delivery_zones"."zone_id";
ALTER SEQUENCE public."discount_types_discount_type_id_seq" OWNED BY public."discount_types"."discount_type_id";
ALTER SEQUENCE public."employee_time_logs_time_log_id_seq" OWNED BY public."employee_time_logs"."time_log_id";
ALTER SEQUENCE public."expenses_expense_id_seq" OWNED BY public."expenses"."expense_id";
ALTER SEQUENCE public."id_verifications_verification_id_seq" OWNED BY public."id_verifications"."verification_id";
ALTER SEQUENCE public."inventory_inventory_id_seq" OWNED BY public."inventory"."inventory_id";
ALTER SEQUENCE public."inventory_log_log_id_seq" OWNED BY public."inventory_log"."log_id";
ALTER SEQUENCE public."inventory_packaging_packaging_id_seq" OWNED BY public."inventory_packaging"."packaging_id";
ALTER SEQUENCE public."login_challenges_challenge_id_seq" OWNED BY public."login_challenges"."challenge_id";
ALTER SEQUENCE public."loyalty_birthday_claims_birthday_claim_id_seq" OWNED BY public."loyalty_birthday_claims"."birthday_claim_id";
ALTER SEQUENCE public."loyalty_campaigns_campaign_id_seq" OWNED BY public."loyalty_campaigns"."campaign_id";
ALTER SEQUENCE public."loyalty_claims_claim_id_seq" OWNED BY public."loyalty_claims"."claim_id";
ALTER SEQUENCE public."loyalty_rewards_reward_id_seq" OWNED BY public."loyalty_rewards"."reward_id";
ALTER SEQUENCE public."loyalty_star_entries_entry_id_seq" OWNED BY public."loyalty_star_entries"."entry_id";
ALTER SEQUENCE public."order_discounts_order_discount_id_seq" OWNED BY public."order_discounts"."order_discount_id";
ALTER SEQUENCE public."password_reset_tokens_token_id_seq" OWNED BY public."password_reset_tokens"."token_id";
ALTER SEQUENCE public."payment_checkouts_checkout_id_seq" OWNED BY public."payment_checkouts"."checkout_id";
ALTER SEQUENCE public."product_categories_category_id_seq" OWNED BY public."product_categories"."category_id";
ALTER SEQUENCE public."product_ingredients_product_ingredient_id_seq" OWNED BY public."product_ingredients"."product_ingredient_id";
ALTER SEQUENCE public."product_variants_product_variant_id_seq" OWNED BY public."product_variants"."product_variant_id";
ALTER SEQUENCE public."products_product_id_seq" OWNED BY public."products"."product_id";
ALTER SEQUENCE public."quick_requests_request_id_seq" OWNED BY public."quick_requests"."request_id";
ALTER SEQUENCE public."sales_order_item_additions_order_item_addition_id_seq" OWNED BY public."sales_order_item_additions"."order_item_addition_id";
ALTER SEQUENCE public."sales_order_items_order_item_id_seq" OWNED BY public."sales_order_items"."order_item_id";
ALTER SEQUENCE public."sales_orders_order_id_seq" OWNED BY public."sales_orders"."order_id";
ALTER SEQUENCE public."shifts_shift_id_seq" OWNED BY public."shifts"."shift_id";
ALTER SEQUENCE public."treasury_accounts_account_id_seq" OWNED BY public."treasury_accounts"."account_id";
ALTER SEQUENCE public."treasury_entries_entry_id_seq" OWNED BY public."treasury_entries"."entry_id";
ALTER SEQUENCE public."trusted_devices_trusted_id_seq" OWNED BY public."trusted_devices"."trusted_id";
ALTER SEQUENCE public."user_sessions_session_id_seq" OWNED BY public."user_sessions"."session_id";
ALTER SEQUENCE public."variant_ingredients_variant_ingredient_id_seq" OWNED BY public."variant_ingredients"."variant_ingredient_id";
ALTER SEQUENCE public."write_off_requests_request_id_seq" OWNED BY public."write_off_requests"."request_id";

-- Keys and checks
ALTER TABLE public."addition_categories" ADD CONSTRAINT "addition_categories_pkey" PRIMARY KEY (addition_id, category_id);
ALTER TABLE public."additions" ADD CONSTRAINT "additions_pkey" PRIMARY KEY (addition_id);
ALTER TABLE public."admin_users" ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY (admin_id);
ALTER TABLE public."ai_insights" ADD CONSTRAINT "ai_insights_pkey" PRIMARY KEY (insight_id);
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_pkey" PRIMARY KEY (movement_id);
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_pkey" PRIMARY KEY (counter_cart_id);
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY (address_id);
ALTER TABLE public."customer_login_failures" ADD CONSTRAINT "customer_login_failures_pkey" PRIMARY KEY (failure_id);
ALTER TABLE public."customer_password_resets" ADD CONSTRAINT "customer_password_resets_pkey" PRIMARY KEY (reset_id);
ALTER TABLE public."customer_sessions" ADD CONSTRAINT "customer_sessions_pkey" PRIMARY KEY (session_id);
ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (customer_id);
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY (delivery_id);
ALTER TABLE public."delivery_zones" ADD CONSTRAINT "delivery_zones_pkey" PRIMARY KEY (zone_id);
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_pkey" PRIMARY KEY (discount_type_id);
ALTER TABLE public."employee_time_logs" ADD CONSTRAINT "employee_time_logs_pkey" PRIMARY KEY (time_log_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_pkey" PRIMARY KEY (expense_id);
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_pkey" PRIMARY KEY (verification_id);
ALTER TABLE public."inventory" ADD CONSTRAINT "inventory_pkey" PRIMARY KEY (inventory_id);
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_pkey" PRIMARY KEY (log_id);
ALTER TABLE public."inventory_packaging" ADD CONSTRAINT "inventory_packaging_pkey" PRIMARY KEY (packaging_id);
ALTER TABLE public."login_challenges" ADD CONSTRAINT "login_challenges_pkey" PRIMARY KEY (challenge_id);
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_pkey" PRIMARY KEY (birthday_claim_id);
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_pkey" PRIMARY KEY (campaign_id);
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_pkey" PRIMARY KEY (claim_id);
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY (reward_id);
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_pkey" PRIMARY KEY (entry_id);
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_pkey" PRIMARY KEY (order_discount_id);
ALTER TABLE public."order_stations" ADD CONSTRAINT "order_stations_pkey" PRIMARY KEY (order_id, station);
ALTER TABLE public."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY (token_id);
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_pkey" PRIMARY KEY (checkout_id);
ALTER TABLE public."product_additions" ADD CONSTRAINT "product_additions_pkey" PRIMARY KEY (product_id, addition_id);
ALTER TABLE public."product_categories" ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY (category_id);
ALTER TABLE public."product_ingredients" ADD CONSTRAINT "product_ingredients_pkey" PRIMARY KEY (product_ingredient_id);
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY (product_variant_id);
ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (product_id);
ALTER TABLE public."quick_requests" ADD CONSTRAINT "quick_requests_pkey" PRIMARY KEY (request_id);
ALTER TABLE public."sales_order_item_additions" ADD CONSTRAINT "sales_order_item_additions_pkey" PRIMARY KEY (order_item_addition_id);
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_pkey" PRIMARY KEY (order_item_id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY (order_id);
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_pkey" PRIMARY KEY (shift_id);
ALTER TABLE public."store_settings" ADD CONSTRAINT "store_settings_pkey" PRIMARY KEY (setting_key);
ALTER TABLE public."treasury_accounts" ADD CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY (account_id);
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_pkey" PRIMARY KEY (entry_id);
ALTER TABLE public."trusted_devices" ADD CONSTRAINT "trusted_devices_pkey" PRIMARY KEY (trusted_id);
ALTER TABLE public."user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY (session_id);
ALTER TABLE public."variant_ingredients" ADD CONSTRAINT "variant_ingredients_pkey" PRIMARY KEY (variant_ingredient_id);
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_pkey" PRIMARY KEY (request_id);
ALTER TABLE public."additions" ADD CONSTRAINT "additions_name_unique" UNIQUE (addition_name);
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_public_token_key" UNIQUE (public_token);
ALTER TABLE public."customer_password_resets" ADD CONSTRAINT "customer_password_resets_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."customer_sessions" ADD CONSTRAINT "customer_sessions_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_order_id_key" UNIQUE (order_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_entry_id_key" UNIQUE (entry_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_movement_id_key" UNIQUE (movement_id);
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_public_token_key" UNIQUE (public_token);
ALTER TABLE public."login_challenges" ADD CONSTRAINT "login_challenges_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_intent_id_key" UNIQUE (intent_id);
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_public_token_key" UNIQUE (public_token);
ALTER TABLE public."product_categories" ADD CONSTRAINT "product_categories_category_name_key" UNIQUE (category_name);
ALTER TABLE public."product_ingredients" ADD CONSTRAINT "product_ingredients_product_id_inventory_id_key" UNIQUE (product_id, inventory_id);
ALTER TABLE public."sales_order_item_additions" ADD CONSTRAINT "sales_order_item_additions_order_item_id_addition_id_key" UNIQUE (order_item_id, addition_id);
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_movement_id_key" UNIQUE (movement_id);
ALTER TABLE public."trusted_devices" ADD CONSTRAINT "trusted_devices_account_kind_account_id_device_hash_key" UNIQUE (account_kind, account_id, device_hash);
ALTER TABLE public."user_sessions" ADD CONSTRAINT "user_sessions_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."variant_ingredients" ADD CONSTRAINT "variant_ingredients_product_variant_id_inventory_id_key" UNIQUE (product_variant_id, inventory_id);
ALTER TABLE public."additions" ADD CONSTRAINT "additions_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE public."additions" ADD CONSTRAINT "additions_station_check" CHECK ((station = ANY (ARRAY['bar'::text, 'kitchen'::text])));
ALTER TABLE public."ai_insights" ADD CONSTRAINT "ai_insights_period" CHECK ((period_start <= period_end));
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_kind_check" CHECK ((kind = ANY (ARRAY['cash_in'::text, 'cash_out'::text, 'cash_drop'::text])));
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_source_app_check" CHECK ((source_app = ANY (ARRAY['cashier'::text, 'admin'::text])));
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_service_type_check" CHECK (((service_type IS NULL) OR (service_type = ANY (ARRAY['dine_in'::text, 'take_out'::text]))));
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_status_check" CHECK ((status = ANY (ARRAY['waiting'::text, 'ordered'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_label_check" CHECK (((length(label) >= 1) AND (length(label) <= 30)));
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_phone_check" CHECK ((phone ~ '^09[0-9]{9}$'::text));
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_recipient_name_check" CHECK (((length(recipient_name) >= 2) AND (length(recipient_name) <= 80)));
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_street_check" CHECK (((length(street) >= 3) AND (length(street) <= 200)));
ALTER TABLE public."customer_sessions" ADD CONSTRAINT "customer_sessions_end_reason_check" CHECK (((end_reason IS NULL) OR (end_reason = ANY (ARRAY['signed_out'::text, 'password_reset'::text, 'password_changed'::text, 'signed_out_by_admin'::text, 'account_deleted'::text, 'deactivated'::text]))));
ALTER TABLE public."customers" ADD CONSTRAINT "customers_phone_format" CHECK (((phone IS NULL) OR (phone ~ '^09[0-9]{9}$'::text)));
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_fee_check" CHECK ((fee >= (0)::numeric));
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_payment_check" CHECK ((payment = ANY (ARRAY['gcash'::text, 'cod'::text])));
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_status_check" CHECK ((status = ANY (ARRAY['preparing'::text, 'ready'::text, 'out'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public."delivery_zones" ADD CONSTRAINT "delivery_zones_fee_check" CHECK ((fee >= (0)::numeric));
ALTER TABLE public."delivery_zones" ADD CONSTRAINT "delivery_zones_min_order_check" CHECK (((min_order IS NULL) OR (min_order > (0)::numeric)));
ALTER TABLE public."delivery_zones" ADD CONSTRAINT "delivery_zones_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 60)));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_check" CHECK (((discount_kind <> 'percent'::text) OR (discount_value <= (100)::numeric)));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_code_check" CHECK ((code = ANY (ARRAY['senior'::text, 'pwd'::text, 'student'::text, 'employee'::text, 'custom'::text])));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_discount_kind_check" CHECK ((discount_kind = ANY (ARRAY['percent'::text, 'fixed'::text])));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_discount_value_check" CHECK ((discount_value > (0)::numeric));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_max_discount_check" CHECK (((max_discount IS NULL) OR (max_discount > (0)::numeric)));
ALTER TABLE public."discount_types" ADD CONSTRAINT "discount_types_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 60)));
ALTER TABLE public."employee_time_logs" ADD CONSTRAINT "employee_time_log_valid_range" CHECK (((time_out IS NULL) OR (time_out >= time_in)));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_paid_from_check" CHECK ((paid_from = ANY (ARRAY['safe'::text, 'drawer'::text, 'owner'::text])));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_paid_from_link" CHECK ((((paid_from <> 'drawer'::text) OR ((movement_id IS NOT NULL) AND (shift_id IS NOT NULL))) AND ((paid_from <> 'safe'::text) OR (entry_id IS NOT NULL))));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_source_app_check" CHECK ((source_app = ANY (ARRAY['cashier'::text, 'admin'::text])));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_void_reason" CHECK (((voided_at IS NULL) OR (void_reason IS NOT NULL)));
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_group_size_check" CHECK (((group_size IS NULL) OR ((group_size >= 1) AND (group_size <= 50))));
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_service_type_check" CHECK (((service_type IS NULL) OR (service_type = ANY (ARRAY['dine_in'::text, 'take_out'::text, 'delivery'::text]))));
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text, 'used'::text])));
ALTER TABLE public."inventory" ADD CONSTRAINT "chk_inventory_derived_not_self" CHECK (((derived_from_inventory_id IS NULL) OR (derived_from_inventory_id <> inventory_id)));
ALTER TABLE public."inventory" ADD CONSTRAINT "chk_inventory_derived_ratio" CHECK (((derived_from_inventory_id IS NULL) OR ((derived_ratio IS NOT NULL) AND (derived_ratio > (0)::numeric))));
ALTER TABLE public."inventory" ADD CONSTRAINT "chk_inventory_unit_cost" CHECK (((unit_cost IS NULL) OR (unit_cost >= (0)::numeric)));
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_change_type_check" CHECK ((change_type = ANY (ARRAY['created'::text, 'restocked'::text, 'manual_edit'::text, 'order_deduction'::text, 'void_restore'::text, 'refund_restore'::text, 'deleted'::text, 'archived'::text, 'restored'::text, 'purged'::text, 'cost_updated'::text, 'written_off'::text])));
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_source_app_check" CHECK ((source_app = ANY (ARRAY['admin'::text, 'cashier'::text, 'mobile'::text])));
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_write_off_check" CHECK ((((change_type = 'written_off'::text) AND COALESCE((write_off_reason = ANY (ARRAY['expired'::text, 'damaged'::text, 'wasted'::text, 'in_house'::text, 'other'::text])), false) AND (quantity_delta < (0)::numeric) AND ((write_off_cost IS NULL) OR (write_off_cost >= (0)::numeric))) OR ((change_type <> 'written_off'::text) AND (write_off_reason IS NULL) AND (write_off_cost IS NULL))));
ALTER TABLE public."inventory_packaging" ADD CONSTRAINT "inventory_packaging_content_quantity_check" CHECK ((content_quantity > (0)::numeric));
ALTER TABLE public."inventory_packaging" ADD CONSTRAINT "inventory_packaging_last_pack_price_check" CHECK (((last_pack_price IS NULL) OR (last_pack_price >= (0)::numeric)));
ALTER TABLE public."login_challenges" ADD CONSTRAINT "login_challenges_account_kind_check" CHECK ((account_kind = ANY (ARRAY['staff'::text, 'customer'::text])));
ALTER TABLE public."login_challenges" ADD CONSTRAINT "login_challenges_portal_check" CHECK ((portal = ANY (ARRAY['admin'::text, 'staff'::text, 'mobile'::text])));
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_status_check" CHECK ((status = ANY (ARRAY['used'::text, 'returned'::text])));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_amount_step_check" CHECK (((amount_step IS NULL) OR (amount_step > (0)::numeric)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_birthday_window_check" CHECK (((birthday_window IS NULL) OR (birthday_window = ANY (ARRAY['day'::text, 'week'::text, 'month'::text]))));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_check" CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_check1" CHECK (((earn_mode <> 'per_amount'::text) OR (amount_step IS NOT NULL)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_earn_mode_check" CHECK ((earn_mode = ANY (ARRAY['per_item'::text, 'per_amount'::text, 'per_order'::text])));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_kind_check" CHECK ((kind = ANY (ARRAY['seasonal'::text, 'birthday'::text])));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_max_stars_per_day_check" CHECK (((max_stars_per_day IS NULL) OR (max_stars_per_day > 0)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_max_stars_per_order_check" CHECK (((max_stars_per_order IS NULL) OR (max_stars_per_order > 0)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_min_order_amount_check" CHECK (((min_order_amount IS NULL) OR (min_order_amount >= (0)::numeric)));
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_stars_per_unit_check" CHECK (((stars_per_unit >= 1) AND (stars_per_unit <= 100)));
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'used'::text, 'cancelled'::text])));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_discount_kind_check" CHECK (((discount_kind IS NULL) OR (discount_kind = ANY (ARRAY['percent'::text, 'fixed'::text]))));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_discount_value_check" CHECK (((discount_value IS NULL) OR (discount_value > (0)::numeric)));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_max_discount_check" CHECK (((max_discount IS NULL) OR (max_discount > (0)::numeric)));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_max_price_check" CHECK (((max_price IS NULL) OR (max_price >= (0)::numeric)));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_min_order_amount_check" CHECK (((min_order_amount IS NULL) OR (min_order_amount >= (0)::numeric)));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_reward_type_check" CHECK ((reward_type = ANY (ARRAY['free_item'::text, 'discount'::text])));
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_stars_cost_check" CHECK (((stars_cost >= 0) AND (stars_cost <= 1000)));
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_kind_check" CHECK ((kind = ANY (ARRAY['earned'::text, 'reversed'::text, 'adjusted'::text, 'carried_out'::text, 'carried_in'::text, 'redeemed'::text, 'restored'::text])));
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_stars_check" CHECK ((stars <> 0));
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_coverage_check" CHECK ((coverage = ANY (ARRAY['items'::text, 'shared'::text])));
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_covered_amount_check" CHECK ((covered_amount >= (0)::numeric));
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_discount_amount_check" CHECK ((discount_amount >= (0)::numeric));
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_group_size_check" CHECK (((group_size IS NULL) OR ((group_size >= 1) AND (group_size <= 50))));
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_vat_exempt_amount_check" CHECK ((vat_exempt_amount >= (0)::numeric));
ALTER TABLE public."order_stations" ADD CONSTRAINT "order_stations_station_check" CHECK ((station = ANY (ARRAY['bar'::text, 'kitchen'::text])));
ALTER TABLE public."order_stations" ADD CONSTRAINT "order_stations_status_check" CHECK ((status = ANY (ARRAY['waiting'::text, 'ready'::text, 'picked_up'::text])));
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_service_type_check" CHECK (((service_type IS NULL) OR (service_type = ANY (ARRAY['dine_in'::text, 'take_out'::text, 'delivery'::text]))));
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_source_app_check" CHECK ((source_app = ANY (ARRAY['cashier'::text, 'mobile'::text])));
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_status_check" CHECK ((status = ANY (ARRAY['awaiting_payment'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text, 'needs_attention'::text])));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_temperature_check" CHECK (((temperature)::text = ANY (ARRAY[('hot'::character varying)::text, ('cold'::character varying)::text])));
ALTER TABLE public."products" ADD CONSTRAINT "chk_products_product_type" CHECK (((product_type)::text = ANY (ARRAY[('recipe'::character varying)::text, ('stock'::character varying)::text])));
ALTER TABLE public."products" ADD CONSTRAINT "products_badge_label_check" CHECK (((badge_label IS NULL) OR ((length(badge_label) >= 1) AND (length(badge_label) <= 30))));
ALTER TABLE public."products" ADD CONSTRAINT "products_station_check" CHECK ((station = ANY (ARRAY['bar'::text, 'kitchen'::text])));
ALTER TABLE public."quick_requests" ADD CONSTRAINT "quick_requests_request_text_check" CHECK (((length(TRIM(BOTH FROM request_text)) >= 1) AND (length(TRIM(BOTH FROM request_text)) <= 40)));
ALTER TABLE public."quick_requests" ADD CONSTRAINT "quick_requests_station_check" CHECK ((station = ANY (ARRAY['bar'::text, 'kitchen'::text])));
ALTER TABLE public."sales_order_item_additions" ADD CONSTRAINT "sales_order_item_additions_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_customizations_array" CHECK (((customizations IS NULL) OR (jsonb_typeof(customizations) = 'array'::text)));
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_item_note_length" CHECK (((item_note IS NULL) OR (length(item_note) <= 120)));
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_station_check" CHECK (((station IS NULL) OR (station = ANY (ARRAY['bar'::text, 'kitchen'::text]))));
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_unit_price_check" CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_cash_portion_check" CHECK (((cash_portion IS NULL) OR ((cash_portion > (0)::numeric) AND (cash_portion < total_amount))));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_delivery_fee_check" CHECK ((delivery_fee >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_discount_amount_check" CHECK ((discount_amount >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_discount_source_check" CHECK (((discount_source IS NULL) OR (discount_source = ANY (ARRAY['reward'::text, 'birthday'::text, 'pwd'::text, 'senior'::text, 'promo'::text, 'student'::text, 'employee'::text, 'custom'::text, 'mixed'::text]))));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_order_source_check" CHECK ((order_source = ANY (ARRAY['cashier'::text, 'online'::text])));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_payment_fee_check" CHECK ((payment_fee >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_return_method_check" CHECK (((return_method IS NULL) OR (return_method = ANY (ARRAY['cash'::text, 'gcash'::text, 'split'::text]))));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_service_type_check" CHECK (((service_type IS NULL) OR (service_type = ANY (ARRAY['dine_in'::text, 'take_out'::text, 'delivery'::text]))));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_total_amount_check" CHECK ((total_amount >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_vat_exempt_amount_check" CHECK ((vat_exempt_amount >= (0)::numeric));
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_wasted_cost_check" CHECK ((wasted_cost >= (0)::numeric));
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_carried_float_check" CHECK ((carried_float >= (0)::numeric));
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_close_after_open" CHECK (((closed_at IS NULL) OR (closed_at >= opened_at)));
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_counted_cash_check" CHECK (((counted_cash IS NULL) OR (counted_cash >= (0)::numeric)));
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_float_kept_check" CHECK ((float_kept >= (0)::numeric));
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_starting_cash_check" CHECK ((starting_cash >= (0)::numeric));
ALTER TABLE public."treasury_accounts" ADD CONSTRAINT "treasury_accounts_balance_check" CHECK ((balance >= (0)::numeric));
ALTER TABLE public."treasury_accounts" ADD CONSTRAINT "treasury_accounts_kind_check" CHECK ((kind = ANY (ARRAY['safe'::text, 'ewallet'::text])));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_balance_after_check" CHECK ((balance_after >= (0)::numeric));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_direction" CHECK ((((kind = 'opening_balance'::text) AND (amount >= (0)::numeric)) OR ((kind = ANY (ARRAY['deposit'::text, 'float_return'::text, 'shift_deposit'::text, 'cash_drop'::text, 'gcash_sales'::text])) AND (amount > (0)::numeric)) OR ((kind = ANY (ARRAY['withdrawal'::text, 'float_out'::text, 'cash_top_up'::text, 'gateway_fee'::text, 'payout'::text, 'expense'::text])) AND (amount < (0)::numeric)) OR ((kind = 'correction'::text) AND (amount <> (0)::numeric))));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_kind_check" CHECK ((kind = ANY (ARRAY['opening_balance'::text, 'deposit'::text, 'withdrawal'::text, 'float_out'::text, 'float_return'::text, 'shift_deposit'::text, 'cash_drop'::text, 'cash_top_up'::text, 'correction'::text, 'gcash_sales'::text, 'gateway_fee'::text, 'payout'::text, 'expense'::text])));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_movement" CHECK (((kind <> ALL (ARRAY['cash_drop'::text, 'cash_top_up'::text])) OR (movement_id IS NOT NULL)));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_shift" CHECK (((kind <> ALL (ARRAY['float_out'::text, 'float_return'::text, 'shift_deposit'::text, 'cash_drop'::text, 'cash_top_up'::text, 'gcash_sales'::text, 'gateway_fee'::text])) OR (shift_id IS NOT NULL)));
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_source_app_check" CHECK ((source_app = ANY (ARRAY['cashier'::text, 'admin'::text])));
ALTER TABLE public."trusted_devices" ADD CONSTRAINT "trusted_devices_account_kind_check" CHECK ((account_kind = ANY (ARRAY['staff'::text, 'customer'::text])));
ALTER TABLE public."user_sessions" ADD CONSTRAINT "user_sessions_app_check" CHECK ((app = ANY (ARRAY['admin'::text, 'cashier'::text])));
ALTER TABLE public."user_sessions" ADD CONSTRAINT "user_sessions_end_reason_check" CHECK (((end_reason IS NULL) OR (end_reason = ANY (ARRAY['signed_out'::text, 'shift_closed'::text, 'password_reset'::text, 'signed_out_by_admin'::text]))));
ALTER TABLE public."variant_ingredients" ADD CONSTRAINT "variant_ingredients_required_quantity_check" CHECK ((required_quantity > (0)::numeric));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_decided" CHECK (((status = 'pending'::text) = (decided_at IS NULL)));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_one_target" CHECK (((product_variant_id IS NULL) <> (inventory_id IS NULL)));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_reason_check" CHECK ((reason = ANY (ARRAY['expired'::text, 'damaged'::text, 'wasted'::text, 'in_house'::text, 'other'::text])));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_source_app_check" CHECK ((source_app = ANY (ARRAY['cashier'::text, 'admin'::text])));
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));

-- Links between tables
ALTER TABLE public."addition_categories" ADD CONSTRAINT "addition_categories_addition_id_fkey" FOREIGN KEY (addition_id) REFERENCES additions(addition_id) ON DELETE CASCADE;
ALTER TABLE public."addition_categories" ADD CONSTRAINT "addition_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES product_categories(category_id) ON DELETE CASCADE;
ALTER TABLE public."additions" ADD CONSTRAINT "additions_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."additions" ADD CONSTRAINT "additions_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id);
ALTER TABLE public."ai_insights" ADD CONSTRAINT "ai_insights_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL;
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_discount_type_id_fkey" FOREIGN KEY (discount_type_id) REFERENCES discount_types(discount_type_id) ON DELETE SET NULL;
ALTER TABLE public."counter_carts" ADD CONSTRAINT "counter_carts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES delivery_zones(zone_id) ON DELETE SET NULL;
ALTER TABLE public."customer_password_resets" ADD CONSTRAINT "customer_password_resets_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_id_discount_type_id_fkey" FOREIGN KEY (id_discount_type_id) REFERENCES discount_types(discount_type_id) ON DELETE SET NULL;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_id_verified_by_fkey" FOREIGN KEY (id_verified_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_address_id_fkey" FOREIGN KEY (address_id) REFERENCES customer_addresses(address_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_cod_remitted_shift_id_fkey" FOREIGN KEY (cod_remitted_shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_cod_remitted_to_fkey" FOREIGN KEY (cod_remitted_to) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE CASCADE;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_rider_admin_id_fkey" FOREIGN KEY (rider_admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."deliveries" ADD CONSTRAINT "deliveries_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES delivery_zones(zone_id) ON DELETE SET NULL;
ALTER TABLE public."employee_time_logs" ADD CONSTRAINT "employee_time_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE CASCADE;
ALTER TABLE public."employee_time_logs" ADD CONSTRAINT "employee_time_logs_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."employee_time_logs" ADD CONSTRAINT "employee_time_logs_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES treasury_entries(entry_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES cash_movements(movement_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_voided_by_fkey" FOREIGN KEY (voided_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL;
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_discount_type_id_fkey" FOREIGN KEY (discount_type_id) REFERENCES discount_types(discount_type_id) ON DELETE SET NULL;
ALTER TABLE public."id_verifications" ADD CONSTRAINT "id_verifications_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."inventory" ADD CONSTRAINT "inventory_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."inventory" ADD CONSTRAINT "inventory_derived_from_inventory_id_fkey" FOREIGN KEY (derived_from_inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_packaging_id_fkey" FOREIGN KEY (packaging_id) REFERENCES inventory_packaging(packaging_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."inventory_log" ADD CONSTRAINT "inventory_log_write_off_request_id_fkey" FOREIGN KEY (write_off_request_id) REFERENCES write_off_requests(request_id);
ALTER TABLE public."inventory_packaging" ADD CONSTRAINT "inventory_packaging_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."inventory_packaging" ADD CONSTRAINT "inventory_packaging_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE CASCADE;
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(campaign_id);
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_birthday_claims" ADD CONSTRAINT "loyalty_birthday_claims_reward_id_fkey" FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_accepted_by_admin_id_fkey" FOREIGN KEY (accepted_by_admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(campaign_id);
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_claims" ADD CONSTRAINT "loyalty_claims_reward_id_fkey" FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(campaign_id) ON DELETE CASCADE;
ALTER TABLE public."loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(campaign_id);
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE;
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."loyalty_star_entries" ADD CONSTRAINT "loyalty_star_entries_reward_id_fkey" FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_discount_type_id_fkey" FOREIGN KEY (discount_type_id) REFERENCES discount_types(discount_type_id) ON DELETE SET NULL;
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE CASCADE;
ALTER TABLE public."order_discounts" ADD CONSTRAINT "order_discounts_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."order_stations" ADD CONSTRAINT "order_stations_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE CASCADE;
ALTER TABLE public."order_stations" ADD CONSTRAINT "order_stations_ready_by_fkey" FOREIGN KEY (ready_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE CASCADE;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_cashier_admin_id_fkey" FOREIGN KEY (cashier_admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_counter_cart_id_fkey" FOREIGN KEY (counter_cart_id) REFERENCES counter_carts(counter_cart_id) ON DELETE SET NULL;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_discount_reward_id_fkey" FOREIGN KEY (discount_reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_id_verification_id_fkey" FOREIGN KEY (id_verification_id) REFERENCES id_verifications(verification_id) ON DELETE SET NULL;
ALTER TABLE public."payment_checkouts" ADD CONSTRAINT "payment_checkouts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE SET NULL;
ALTER TABLE public."product_additions" ADD CONSTRAINT "product_additions_addition_id_fkey" FOREIGN KEY (addition_id) REFERENCES additions(addition_id);
ALTER TABLE public."product_additions" ADD CONSTRAINT "product_additions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
ALTER TABLE public."product_ingredients" ADD CONSTRAINT "product_ingredients_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE CASCADE;
ALTER TABLE public."product_ingredients" ADD CONSTRAINT "product_ingredients_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
ALTER TABLE public."products" ADD CONSTRAINT "products_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."sales_order_item_additions" ADD CONSTRAINT "sales_order_item_additions_addition_id_fkey" FOREIGN KEY (addition_id) REFERENCES additions(addition_id);
ALTER TABLE public."sales_order_item_additions" ADD CONSTRAINT "sales_order_item_additions_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES sales_order_items(order_item_id) ON DELETE CASCADE;
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES sales_orders(order_id) ON DELETE CASCADE;
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(product_id);
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(product_variant_id);
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_reward_id_fkey" FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_cashier_admin_id_fkey" FOREIGN KEY (cashier_admin_id) REFERENCES admin_users(admin_id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL;
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_discount_reward_id_fkey" FOREIGN KEY (discount_reward_id) REFERENCES loyalty_rewards(reward_id) ON DELETE SET NULL;
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_reversed_by_admin_id_fkey" FOREIGN KEY (reversed_by_admin_id) REFERENCES admin_users(admin_id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_reversed_shift_id_fkey" FOREIGN KEY (reversed_shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."shifts" ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."store_settings" ADD CONSTRAINT "store_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_account_id_fkey" FOREIGN KEY (account_id) REFERENCES treasury_accounts(account_id);
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_corrects_entry_id_fkey" FOREIGN KEY (corrects_entry_id) REFERENCES treasury_entries(entry_id);
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES cash_movements(movement_id);
ALTER TABLE public."treasury_entries" ADD CONSTRAINT "treasury_entries_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);
ALTER TABLE public."user_sessions" ADD CONSTRAINT "user_sessions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE CASCADE;
ALTER TABLE public."variant_ingredients" ADD CONSTRAINT "variant_ingredients_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE RESTRICT;
ALTER TABLE public."variant_ingredients" ADD CONSTRAINT "variant_ingredients_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(product_variant_id) ON DELETE CASCADE;
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id);
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(product_variant_id);
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES admin_users(admin_id) ON DELETE SET NULL;
ALTER TABLE public."write_off_requests" ADD CONSTRAINT "write_off_requests_shift_id_fkey" FOREIGN KEY (shift_id) REFERENCES shifts(shift_id);

-- Indexes
CREATE INDEX additions_inventory_id_idx ON public.additions USING btree (inventory_id);
CREATE INDEX employee_time_logs_admin_id_idx ON public.employee_time_logs USING btree (admin_id);
CREATE INDEX employee_time_logs_time_in_idx ON public.employee_time_logs USING btree (time_in DESC);
CREATE INDEX idx_ai_insights_created ON public.ai_insights USING btree (created_at DESC);
CREATE INDEX idx_cash_movements_shift ON public.cash_movements USING btree (shift_id, created_at);
CREATE INDEX idx_counter_carts_status ON public.counter_carts USING btree (status, created_at);
CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses USING btree (customer_id);
CREATE INDEX idx_customer_login_failures_key ON public.customer_login_failures USING btree (username_key, created_at);
CREATE INDEX idx_customer_password_resets_customer ON public.customer_password_resets USING btree (customer_id, created_at);
CREATE INDEX idx_customer_sessions_active ON public.customer_sessions USING btree (customer_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_customers_phone ON public.customers USING btree (phone) WHERE (phone IS NOT NULL);
CREATE INDEX idx_deliveries_remitted_shift ON public.deliveries USING btree (cod_remitted_shift_id);
CREATE INDEX idx_deliveries_rider ON public.deliveries USING btree (rider_admin_id, status);
CREATE INDEX idx_deliveries_status ON public.deliveries USING btree (status, created_at);
CREATE INDEX idx_employee_time_logs_is_archived ON public.employee_time_logs USING btree (is_archived);
CREATE INDEX idx_employee_time_logs_shift_id ON public.employee_time_logs USING btree (shift_id);
CREATE INDEX idx_expenses_shift ON public.expenses USING btree (shift_id);
CREATE INDEX idx_expenses_spent_on ON public.expenses USING btree (spent_on);
CREATE INDEX idx_id_verifications_status ON public.id_verifications USING btree (status, created_at);
CREATE INDEX idx_inventory_derived_from ON public.inventory USING btree (derived_from_inventory_id);
CREATE INDEX idx_inventory_is_archived ON public.inventory USING btree (is_archived);
CREATE INDEX idx_inventory_log_created_at ON public.inventory_log USING btree (created_at DESC);
CREATE INDEX idx_inventory_log_inventory_id ON public.inventory_log USING btree (inventory_id);
CREATE INDEX idx_inventory_log_order_id ON public.inventory_log USING btree (order_id);
CREATE INDEX idx_inventory_log_shift_id ON public.inventory_log USING btree (shift_id);
CREATE INDEX idx_inventory_log_written_off ON public.inventory_log USING btree (created_at) WHERE (change_type = 'written_off'::text);
CREATE INDEX idx_inventory_packaging_inventory_id ON public.inventory_packaging USING btree (inventory_id);
CREATE INDEX idx_login_challenges_account ON public.login_challenges USING btree (account_kind, account_id, created_at);
CREATE INDEX idx_loyalty_birthday_claims_campaign ON public.loyalty_birthday_claims USING btree (campaign_id, created_at);
CREATE INDEX idx_loyalty_claims_customer ON public.loyalty_claims USING btree (customer_id, created_at);
CREATE INDEX idx_loyalty_claims_open ON public.loyalty_claims USING btree (status, expires_at) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text]));
CREATE INDEX idx_loyalty_entries_campaign ON public.loyalty_star_entries USING btree (campaign_id, created_at);
CREATE INDEX idx_loyalty_entries_customer ON public.loyalty_star_entries USING btree (customer_id, campaign_id);
CREATE INDEX idx_loyalty_rewards_campaign ON public.loyalty_rewards USING btree (campaign_id, sort_order);
CREATE INDEX idx_order_discounts_created ON public.order_discounts USING btree (created_at);
CREATE INDEX idx_order_discounts_id_number ON public.order_discounts USING btree (type_code, lower(id_number));
CREATE INDEX idx_order_discounts_order ON public.order_discounts USING btree (order_id);
CREATE INDEX idx_order_stations_open ON public.order_stations USING btree (station, status);
CREATE INDEX idx_password_reset_tokens_admin_created ON public.password_reset_tokens USING btree (admin_id, created_at DESC);
CREATE INDEX idx_payment_checkouts_status ON public.payment_checkouts USING btree (status, created_at DESC);
CREATE INDEX idx_product_variants_is_archived ON public.product_variants USING btree (is_archived);
CREATE INDEX idx_products_is_archived ON public.products USING btree (is_archived);
CREATE INDEX idx_sales_order_items_reward ON public.sales_order_items USING btree (reward_id) WHERE (reward_id IS NOT NULL);
CREATE INDEX idx_sales_orders_customer ON public.sales_orders USING btree (customer_id, created_at) WHERE (customer_id IS NOT NULL);
CREATE INDEX idx_sales_orders_is_archived ON public.sales_orders USING btree (is_archived);
CREATE INDEX idx_sales_orders_reversed_shift_id ON public.sales_orders USING btree (reversed_shift_id);
CREATE INDEX idx_sales_orders_shift_id ON public.sales_orders USING btree (shift_id);
CREATE INDEX idx_treasury_entries_account ON public.treasury_entries USING btree (account_id, created_at);
CREATE INDEX idx_treasury_entries_shift ON public.treasury_entries USING btree (shift_id);
CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (admin_id, app) WHERE (ended_at IS NULL);
CREATE INDEX idx_write_off_requests_pending ON public.write_off_requests USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_write_off_requests_shift ON public.write_off_requests USING btree (shift_id);
CREATE INDEX product_additions_addition_id_idx ON public.product_additions USING btree (addition_id);
CREATE INDEX sales_order_item_additions_addition_idx ON public.sales_order_item_additions USING btree (addition_id);
CREATE INDEX sales_order_item_additions_order_item_idx ON public.sales_order_item_additions USING btree (order_item_id);
CREATE INDEX sales_order_items_order_id_idx ON public.sales_order_items USING btree (order_id);
CREATE INDEX sales_orders_queue_today_idx ON public.sales_orders USING btree (created_at, queue_status, queue_number);
CREATE INDEX shifts_opened_at_idx ON public.shifts USING btree (opened_at DESC);
CREATE UNIQUE INDEX admin_users_email_lower_unique_idx ON public.admin_users USING btree (lower((email)::text));
CREATE UNIQUE INDEX customers_email_key ON public.customers USING btree (lower((email)::text)) WHERE (email IS NOT NULL);
CREATE UNIQUE INDEX customers_username_key ON public.customers USING btree (lower((username)::text)) WHERE (username IS NOT NULL);
CREATE UNIQUE INDEX discount_types_builtin_code ON public.discount_types USING btree (code) WHERE (code <> 'custom'::text);
CREATE UNIQUE INDEX employee_one_open_time_log_idx ON public.employee_time_logs USING btree (admin_id) WHERE (time_out IS NULL);
CREATE UNIQUE INDEX inventory_packaging_active_name_idx ON public.inventory_packaging USING btree (inventory_id, lower(packaging_name)) WHERE (is_archived = false);
CREATE UNIQUE INDEX loyalty_birthday_one_per_year ON public.loyalty_birthday_claims USING btree (customer_id, claim_year) WHERE (status = 'used'::text);
CREATE UNIQUE INDEX loyalty_campaigns_one_active_kind ON public.loyalty_campaigns USING btree (kind) WHERE is_active;
CREATE UNIQUE INDEX loyalty_entries_one_earned ON public.loyalty_star_entries USING btree (order_id) WHERE (kind = 'earned'::text);
CREATE UNIQUE INDEX loyalty_entries_one_reversed ON public.loyalty_star_entries USING btree (order_id) WHERE (kind = 'reversed'::text);
CREATE UNIQUE INDEX product_variants_product_size_temperature_key ON public.product_variants USING btree (product_id, lower(TRIM(BOTH FROM size_label)), temperature);
CREATE UNIQUE INDEX product_variants_unique_idx ON public.product_variants USING btree (product_id, size_label, COALESCE(temperature, 'both'::character varying));
CREATE UNIQUE INDEX quick_requests_text_station_key ON public.quick_requests USING btree (lower(request_text), station);
CREATE UNIQUE INDEX sales_orders_customer_order_token_idx ON public.sales_orders USING btree (customer_order_token) WHERE (customer_order_token IS NOT NULL);
CREATE UNIQUE INDEX shifts_one_open_idx ON public.shifts USING btree (((closed_at IS NULL))) WHERE (closed_at IS NULL);
CREATE UNIQUE INDEX uq_treasury_account_name ON public.treasury_accounts USING btree (lower(name));
CREATE UNIQUE INDEX uq_treasury_one_safe ON public.treasury_accounts USING btree (kind) WHERE (kind = 'safe'::text);
CREATE UNIQUE INDEX uq_treasury_opening ON public.treasury_entries USING btree (account_id) WHERE (kind = 'opening_balance'::text);

-- Views
CREATE VIEW public."shift_summaries" WITH (security_invoker=true) AS
SELECT s.shift_id,
    s.opened_at,
    s.closed_at,
    s.opened_by,
    s.closed_by,
    opener.full_name AS opened_by_name,
    closer.full_name AS closed_by_name,
    s.is_historical,
    s.starting_cash,
    s.counted_cash,
    s.closing_notes,
    (s.opened_at AT TIME ZONE 'Asia/Manila'::text)::date AS business_date,
    COALESCE(sold.order_count, 0::bigint)::integer AS order_count,
    COALESCE(sold.mobile_order_count, 0::bigint)::integer AS mobile_order_count,
    COALESCE(items.items_sold, 0::bigint)::integer AS items_sold,
    COALESCE(sold.gross_sales, 0::numeric) AS gross_sales,
    COALESCE(sold.cash_sales, 0::numeric) AS cash_sales,
    COALESCE(sold.online_sales, 0::numeric) AS online_sales,
    COALESCE(reversed.void_count, 0::bigint)::integer AS void_count,
    COALESCE(reversed.refund_count, 0::bigint)::integer AS refund_count,
    COALESCE(reversed.reversed_amount, 0::numeric) AS reversed_amount,
    COALESCE(reversed.cash_reversed, 0::numeric) AS cash_reversed,
    COALESCE(sold.gross_sales, 0::numeric) - COALESCE(reversed.reversed_amount, 0::numeric) AS net_sales,
    COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) + COALESCE(cod.cod_remitted, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS expected_cash,
    s.counted_cash - COALESCE(s.expected_cash, s.starting_cash + COALESCE(sold.cash_sales, 0::numeric) + COALESCE(cod.cod_remitted, 0::numeric) - COALESCE(reversed.cash_reversed, 0::numeric) + COALESCE(moves.cash_added, 0::numeric) - COALESCE(moves.cash_removed, 0::numeric)) AS cash_difference,
    COALESCE(costs.sold_cost, 0::numeric) - COALESCE(costs.reversed_cost, 0::numeric) AS cost_of_goods,
    COALESCE(costs.uncosted_items, 0::bigint)::integer AS uncosted_items,
    COALESCE(reversed.gcash_returned, 0::numeric) AS gcash_returned,
    COALESCE(moves.cash_added, 0::numeric) AS cash_added,
    COALESCE(moves.cash_removed, 0::numeric) AS cash_removed,
    COALESCE(sold.cod_sales, 0::numeric) AS cod_sales,
    COALESCE(cod.cod_remitted, 0::numeric) AS cod_remitted,
    COALESCE(sold.delivery_fees, 0::numeric) AS delivery_fees,
    COALESCE(sold.delivery_count, 0::bigint)::integer AS delivery_count
   FROM shifts s
     LEFT JOIN admin_users opener ON opener.admin_id = s.opened_by
     LEFT JOIN admin_users closer ON closer.admin_id = s.closed_by
     LEFT JOIN LATERAL ( SELECT count(*) AS order_count,
            count(*) FILTER (WHERE so.order_source = 'online'::text) AS mobile_order_count,
            sum(so.total_amount) AS gross_sales,
            sum(
                CASE so.payment_method::text
                    WHEN 'cash'::text THEN so.total_amount
                    WHEN 'split'::text THEN COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS cash_sales,
            sum(
                CASE so.payment_method::text
                    WHEN 'cash'::text THEN 0::numeric
                    WHEN 'cod'::text THEN 0::numeric
                    WHEN 'split'::text THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric)
                    ELSE so.total_amount
                END) AS online_sales,
            sum(so.total_amount) FILTER (WHERE so.payment_method::text = 'cod'::text) AS cod_sales,
            sum(so.delivery_fee) AS delivery_fees,
            count(*) FILTER (WHERE so.service_type = 'delivery'::text) AS delivery_count
           FROM sales_orders so
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) sold ON true
     LEFT JOIN LATERAL ( SELECT sum(soi.quantity) AS items_sold
           FROM sales_order_items soi
             JOIN sales_orders so ON so.order_id = soi.order_id
          WHERE so.shift_id = s.shift_id AND so.is_archived = false) items ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE so.status::text = ANY (ARRAY['void'::text, 'voided'::text])) AS void_count,
            count(*) FILTER (WHERE so.status::text = ANY (ARRAY['refund'::text, 'refunded'::text])) AS refund_count,
            sum(so.total_amount) AS reversed_amount,
            sum(
                CASE COALESCE(so.return_method,
                    CASE
                        WHEN so.payment_method::text = 'cash'::text THEN 'cash'::text
                        ELSE 'online'::text
                    END)
                    WHEN 'cash'::text THEN so.total_amount
                    WHEN 'split'::text THEN COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS cash_reversed,
            sum(
                CASE so.return_method
                    WHEN 'gcash'::text THEN so.total_amount
                    WHEN 'split'::text THEN so.total_amount - COALESCE(so.cash_portion, 0::numeric)
                    ELSE 0::numeric
                END) AS gcash_returned
           FROM sales_orders so
          WHERE so.reversed_shift_id = s.shift_id AND so.is_archived = false) reversed ON true
     LEFT JOIN LATERAL ( SELECT sum(line.line_cost) FILTER (WHERE so.shift_id = s.shift_id) AS sold_cost,
            sum(line.line_cost) FILTER (WHERE so.reversed_shift_id = s.shift_id) AS reversed_cost,
            sum(line.quantity) FILTER (WHERE so.shift_id = s.shift_id AND line.line_cost IS NULL) AS uncosted_items
           FROM sales_orders so
             JOIN LATERAL ( SELECT soi.quantity,
                        CASE
                            WHEN soi.unit_cost IS NOT NULL AND COALESCE(line_additions.all_costed, true) THEN soi.quantity::numeric * soi.unit_cost + COALESCE(line_additions.cost, 0::numeric)
                            ELSE NULL::numeric
                        END AS line_cost
                   FROM sales_order_items soi
                     LEFT JOIN LATERAL ( SELECT sum(soia.quantity * soia.unit_cost) AS cost,
                            bool_and(soia.unit_cost IS NOT NULL) AS all_costed
                           FROM sales_order_item_additions soia
                          WHERE soia.order_item_id = soi.order_item_id) line_additions ON true
                  WHERE soi.order_id = so.order_id) line ON true
          WHERE (so.shift_id = s.shift_id OR so.reversed_shift_id = s.shift_id) AND so.is_archived = false) costs ON true
     LEFT JOIN LATERAL ( SELECT sum(cm.amount) FILTER (WHERE cm.kind = 'cash_in'::text) AS cash_added,
            sum(cm.amount) FILTER (WHERE cm.kind = ANY (ARRAY['cash_out'::text, 'cash_drop'::text])) AS cash_removed
           FROM cash_movements cm
          WHERE cm.shift_id = s.shift_id) moves ON true
     LEFT JOIN LATERAL ( SELECT sum(d.cod_collected) AS cod_remitted
           FROM deliveries d
          WHERE d.cod_remitted_shift_id = s.shift_id) cod ON true;

-- Row-level security (on for every table, as here)
ALTER TABLE public."addition_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."additions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."counter_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_login_failures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_password_resets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."delivery_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."discount_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_time_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."id_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_packaging" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."login_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."loyalty_birthday_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."loyalty_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."loyalty_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."loyalty_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."loyalty_star_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_stations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_checkouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_additions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quick_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_order_item_additions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."store_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."treasury_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."treasury_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trusted_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."variant_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."write_off_requests" ENABLE ROW LEVEL SECURITY;

-- What the Supabase API roles may touch (as here)
REVOKE ALL ON TABLE public."addition_categories" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."addition_categories" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."addition_categories" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."addition_categories" TO service_role;
REVOKE ALL ON TABLE public."additions" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."additions" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."additions" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."additions" TO service_role;
REVOKE ALL ON SEQUENCE public."additions_addition_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."additions_addition_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."additions_addition_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."additions_addition_id_seq" TO service_role;
REVOKE ALL ON TABLE public."admin_users" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."admin_users" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."admin_users" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."admin_users" TO service_role;
REVOKE ALL ON SEQUENCE public."admin_users_admin_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."admin_users_admin_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."admin_users_admin_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."admin_users_admin_id_seq" TO service_role;
REVOKE ALL ON TABLE public."ai_insights" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."ai_insights" TO service_role;
REVOKE ALL ON SEQUENCE public."ai_insights_insight_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."ai_insights_insight_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."ai_insights_insight_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."ai_insights_insight_id_seq" TO service_role;
REVOKE ALL ON TABLE public."cash_movements" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."cash_movements" TO service_role;
REVOKE ALL ON SEQUENCE public."cash_movements_movement_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."cash_movements_movement_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."cash_movements_movement_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."cash_movements_movement_id_seq" TO service_role;
REVOKE ALL ON TABLE public."counter_carts" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."counter_carts" TO service_role;
REVOKE ALL ON SEQUENCE public."counter_carts_counter_cart_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."counter_carts_counter_cart_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."counter_carts_counter_cart_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."counter_carts_counter_cart_id_seq" TO service_role;
REVOKE ALL ON TABLE public."customer_addresses" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."customer_addresses" TO service_role;
REVOKE ALL ON SEQUENCE public."customer_addresses_address_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_addresses_address_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_addresses_address_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_addresses_address_id_seq" TO service_role;
REVOKE ALL ON TABLE public."customer_login_failures" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."customer_login_failures" TO service_role;
REVOKE ALL ON SEQUENCE public."customer_login_failures_failure_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_login_failures_failure_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_login_failures_failure_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_login_failures_failure_id_seq" TO service_role;
REVOKE ALL ON TABLE public."customer_password_resets" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."customer_password_resets" TO service_role;
REVOKE ALL ON SEQUENCE public."customer_password_resets_reset_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_password_resets_reset_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_password_resets_reset_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_password_resets_reset_id_seq" TO service_role;
REVOKE ALL ON TABLE public."customer_sessions" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."customer_sessions" TO service_role;
REVOKE ALL ON SEQUENCE public."customer_sessions_session_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_sessions_session_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_sessions_session_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customer_sessions_session_id_seq" TO service_role;
REVOKE ALL ON TABLE public."customers" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."customers" TO service_role;
REVOKE ALL ON SEQUENCE public."customers_customer_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customers_customer_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customers_customer_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."customers_customer_id_seq" TO service_role;
REVOKE ALL ON TABLE public."deliveries" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."deliveries" TO service_role;
REVOKE ALL ON SEQUENCE public."deliveries_delivery_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."deliveries_delivery_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."deliveries_delivery_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."deliveries_delivery_id_seq" TO service_role;
REVOKE ALL ON TABLE public."delivery_zones" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."delivery_zones" TO service_role;
REVOKE ALL ON SEQUENCE public."delivery_zones_zone_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."delivery_zones_zone_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."delivery_zones_zone_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."delivery_zones_zone_id_seq" TO service_role;
REVOKE ALL ON TABLE public."discount_types" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."discount_types" TO service_role;
REVOKE ALL ON SEQUENCE public."discount_types_discount_type_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."discount_types_discount_type_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."discount_types_discount_type_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."discount_types_discount_type_id_seq" TO service_role;
REVOKE ALL ON TABLE public."employee_time_logs" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."employee_time_logs" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."employee_time_logs" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."employee_time_logs" TO service_role;
REVOKE ALL ON SEQUENCE public."employee_time_logs_time_log_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."employee_time_logs_time_log_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."employee_time_logs_time_log_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."employee_time_logs_time_log_id_seq" TO service_role;
REVOKE ALL ON TABLE public."expenses" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."expenses" TO service_role;
REVOKE ALL ON SEQUENCE public."expenses_expense_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."expenses_expense_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."expenses_expense_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."expenses_expense_id_seq" TO service_role;
REVOKE ALL ON TABLE public."id_verifications" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."id_verifications" TO service_role;
REVOKE ALL ON SEQUENCE public."id_verifications_verification_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."id_verifications_verification_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."id_verifications_verification_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."id_verifications_verification_id_seq" TO service_role;
REVOKE ALL ON TABLE public."inventory" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory" TO service_role;
REVOKE ALL ON SEQUENCE public."inventory_inventory_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_inventory_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_inventory_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_inventory_id_seq" TO service_role;
REVOKE ALL ON TABLE public."inventory_log" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_log" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_log" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_log" TO service_role;
REVOKE ALL ON SEQUENCE public."inventory_log_log_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_log_log_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_log_log_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_log_log_id_seq" TO service_role;
REVOKE ALL ON TABLE public."inventory_packaging" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_packaging" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_packaging" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."inventory_packaging" TO service_role;
REVOKE ALL ON SEQUENCE public."inventory_packaging_packaging_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_packaging_packaging_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_packaging_packaging_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."inventory_packaging_packaging_id_seq" TO service_role;
REVOKE ALL ON TABLE public."login_challenges" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."login_challenges" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."login_challenges" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."login_challenges" TO service_role;
REVOKE ALL ON SEQUENCE public."login_challenges_challenge_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."login_challenges_challenge_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."login_challenges_challenge_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."login_challenges_challenge_id_seq" TO service_role;
REVOKE ALL ON TABLE public."loyalty_birthday_claims" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."loyalty_birthday_claims" TO service_role;
REVOKE ALL ON SEQUENCE public."loyalty_birthday_claims_birthday_claim_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_birthday_claims_birthday_claim_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_birthday_claims_birthday_claim_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_birthday_claims_birthday_claim_id_seq" TO service_role;
REVOKE ALL ON TABLE public."loyalty_campaigns" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."loyalty_campaigns" TO service_role;
REVOKE ALL ON SEQUENCE public."loyalty_campaigns_campaign_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_campaigns_campaign_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_campaigns_campaign_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_campaigns_campaign_id_seq" TO service_role;
REVOKE ALL ON TABLE public."loyalty_claims" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."loyalty_claims" TO service_role;
REVOKE ALL ON SEQUENCE public."loyalty_claims_claim_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_claims_claim_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_claims_claim_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_claims_claim_id_seq" TO service_role;
REVOKE ALL ON TABLE public."loyalty_rewards" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."loyalty_rewards" TO service_role;
REVOKE ALL ON SEQUENCE public."loyalty_rewards_reward_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_rewards_reward_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_rewards_reward_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_rewards_reward_id_seq" TO service_role;
REVOKE ALL ON TABLE public."loyalty_star_entries" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."loyalty_star_entries" TO service_role;
REVOKE ALL ON SEQUENCE public."loyalty_star_entries_entry_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_star_entries_entry_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_star_entries_entry_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."loyalty_star_entries_entry_id_seq" TO service_role;
REVOKE ALL ON TABLE public."order_discounts" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."order_discounts" TO service_role;
REVOKE ALL ON SEQUENCE public."order_discounts_order_discount_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."order_discounts_order_discount_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."order_discounts_order_discount_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."order_discounts_order_discount_id_seq" TO service_role;
REVOKE ALL ON TABLE public."order_stations" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."order_stations" TO service_role;
REVOKE ALL ON TABLE public."password_reset_tokens" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."password_reset_tokens" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."password_reset_tokens" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."password_reset_tokens" TO service_role;
REVOKE ALL ON SEQUENCE public."password_reset_tokens_token_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."password_reset_tokens_token_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."password_reset_tokens_token_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."password_reset_tokens_token_id_seq" TO service_role;
REVOKE ALL ON TABLE public."payment_checkouts" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."payment_checkouts" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."payment_checkouts" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."payment_checkouts" TO service_role;
REVOKE ALL ON SEQUENCE public."payment_checkouts_checkout_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."payment_checkouts_checkout_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."payment_checkouts_checkout_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."payment_checkouts_checkout_id_seq" TO service_role;
REVOKE ALL ON TABLE public."product_additions" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_additions" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_additions" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_additions" TO service_role;
REVOKE ALL ON TABLE public."product_categories" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_categories" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_categories" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_categories" TO service_role;
REVOKE ALL ON SEQUENCE public."product_categories_category_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_categories_category_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_categories_category_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_categories_category_id_seq" TO service_role;
REVOKE ALL ON TABLE public."product_ingredients" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_ingredients" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_ingredients" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_ingredients" TO service_role;
REVOKE ALL ON SEQUENCE public."product_ingredients_product_ingredient_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_ingredients_product_ingredient_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_ingredients_product_ingredient_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_ingredients_product_ingredient_id_seq" TO service_role;
REVOKE ALL ON TABLE public."product_variants" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_variants" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_variants" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."product_variants" TO service_role;
REVOKE ALL ON SEQUENCE public."product_variants_product_variant_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_variants_product_variant_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_variants_product_variant_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."product_variants_product_variant_id_seq" TO service_role;
REVOKE ALL ON TABLE public."products" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."products" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."products" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."products" TO service_role;
REVOKE ALL ON SEQUENCE public."products_product_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."products_product_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."products_product_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."products_product_id_seq" TO service_role;
REVOKE ALL ON TABLE public."quick_requests" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."quick_requests" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."quick_requests" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."quick_requests" TO service_role;
REVOKE ALL ON SEQUENCE public."quick_requests_request_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."quick_requests_request_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."quick_requests_request_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."quick_requests_request_id_seq" TO service_role;
REVOKE ALL ON TABLE public."sales_order_item_additions" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_item_additions" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_item_additions" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_item_additions" TO service_role;
REVOKE ALL ON SEQUENCE public."sales_order_item_additions_order_item_addition_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_item_additions_order_item_addition_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_item_additions_order_item_addition_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_item_additions_order_item_addition_id_seq" TO service_role;
REVOKE ALL ON TABLE public."sales_order_items" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_items" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_items" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_order_items" TO service_role;
REVOKE ALL ON SEQUENCE public."sales_order_items_order_item_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_items_order_item_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_items_order_item_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_order_items_order_item_id_seq" TO service_role;
REVOKE ALL ON TABLE public."sales_orders" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_orders" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_orders" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."sales_orders" TO service_role;
REVOKE ALL ON SEQUENCE public."sales_orders_order_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_orders_order_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_orders_order_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."sales_orders_order_id_seq" TO service_role;
REVOKE ALL ON TABLE public."shift_summaries" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."shift_summaries" TO service_role;
REVOKE ALL ON TABLE public."shifts" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."shifts" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."shifts" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."shifts" TO service_role;
REVOKE ALL ON SEQUENCE public."shifts_shift_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."shifts_shift_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."shifts_shift_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."shifts_shift_id_seq" TO service_role;
REVOKE ALL ON TABLE public."store_settings" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."store_settings" TO service_role;
REVOKE ALL ON TABLE public."treasury_accounts" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."treasury_accounts" TO service_role;
REVOKE ALL ON SEQUENCE public."treasury_accounts_account_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_accounts_account_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_accounts_account_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_accounts_account_id_seq" TO service_role;
REVOKE ALL ON TABLE public."treasury_entries" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."treasury_entries" TO service_role;
REVOKE ALL ON SEQUENCE public."treasury_entries_entry_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_entries_entry_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_entries_entry_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."treasury_entries_entry_id_seq" TO service_role;
REVOKE ALL ON TABLE public."trusted_devices" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."trusted_devices" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."trusted_devices" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."trusted_devices" TO service_role;
REVOKE ALL ON SEQUENCE public."trusted_devices_trusted_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."trusted_devices_trusted_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."trusted_devices_trusted_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."trusted_devices_trusted_id_seq" TO service_role;
REVOKE ALL ON TABLE public."user_sessions" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."user_sessions" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."user_sessions" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."user_sessions" TO service_role;
REVOKE ALL ON SEQUENCE public."user_sessions_session_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."user_sessions_session_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."user_sessions_session_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."user_sessions_session_id_seq" TO service_role;
REVOKE ALL ON TABLE public."variant_ingredients" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."variant_ingredients" TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."variant_ingredients" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."variant_ingredients" TO service_role;
REVOKE ALL ON SEQUENCE public."variant_ingredients_variant_ingredient_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."variant_ingredients_variant_ingredient_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."variant_ingredients_variant_ingredient_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."variant_ingredients_variant_ingredient_id_seq" TO service_role;
REVOKE ALL ON TABLE public."write_off_requests" FROM anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."write_off_requests" TO service_role;
REVOKE ALL ON SEQUENCE public."write_off_requests_request_id_seq" FROM anon, authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."write_off_requests_request_id_seq" TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."write_off_requests_request_id_seq" TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."write_off_requests_request_id_seq" TO service_role;
REVOKE ALL ON FUNCTION public."current_open_shift_id"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."current_open_shift_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."current_open_shift_id"() TO postgres;
GRANT EXECUTE ON FUNCTION public."current_open_shift_id"() TO anon;
GRANT EXECUTE ON FUNCTION public."current_open_shift_id"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."current_open_shift_id"() TO service_role;

COMMIT;
