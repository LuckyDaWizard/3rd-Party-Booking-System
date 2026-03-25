-- Create bookings table for persisting patient booking data
CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'In Progress'
    CHECK (status IN (
      'In Progress',
      'Payment Complete',
      'Successful',
      'Discarded',
      'Abandoned'
    )),

  -- Track how far the user got
  current_step TEXT NOT NULL DEFAULT 'search',

  -- Search page data
  search_type TEXT,

  -- Patient basic info
  first_names TEXT,
  surname TEXT,
  id_type TEXT,
  id_number TEXT,
  title TEXT,
  nationality TEXT,
  gender TEXT,
  date_of_birth TEXT,

  -- Address info
  address TEXT,
  suburb TEXT,
  city TEXT,
  province TEXT,
  country TEXT,
  postal_code TEXT,

  -- Contact details
  country_code TEXT,
  contact_number TEXT,
  email_address TEXT,
  script_to_another_email BOOLEAN DEFAULT false,
  additional_email TEXT,

  -- Payment type
  payment_type TEXT,

  -- Patient metrics
  blood_pressure TEXT,
  glucose TEXT,
  temperature TEXT,
  oxygen_saturation TEXT,
  urine_dipstick TEXT,
  heart_rate TEXT,
  additional_comments TEXT,

  -- Terms acceptance
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ
);

-- Index for Patient History queries
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_created_at ON bookings (created_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();
