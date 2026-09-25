-- One-time manual migration: extends inventory_log.change_type so that
-- Archives actions on inventory items (archive, restore, permanently delete)
-- are also traceable in the exportable inventory report, alongside restocks,
-- manual edits, and order deductions. Safe to re-run.

ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_change_type_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_change_type_check CHECK (change_type IN (
  'created', 'restocked', 'manual_edit', 'order_deduction',
  'void_restore', 'refund_restore', 'deleted',
  'archived', 'restored', 'purged'
));
