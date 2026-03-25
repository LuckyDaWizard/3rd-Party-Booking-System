-- Add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('system_admin', 'unit_manager', 'user'));

-- Link bookings to a unit so we can filter by unit
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
