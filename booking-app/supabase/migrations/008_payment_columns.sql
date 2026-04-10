-- Migration 008: Add payment tracking columns to bookings table
-- Required for PayFast integration

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS pf_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
