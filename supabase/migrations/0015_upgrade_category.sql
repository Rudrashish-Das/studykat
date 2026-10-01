-- 0015_upgrade_category.sql
-- A new kind of catalog item: an upgrade. Bought like furniture and kept in
-- `inventory`, but never placed in the room — owning one unlocks a setting
-- (extra chimes, cat and room sounds).
--
-- On its own because a new enum value cannot be used in the transaction that
-- adds it; 0016 seeds the rows.

alter type public.item_category add value if not exists 'upgrade';
