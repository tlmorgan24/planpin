-------- DELETE EXISTING --------

DROP VIEW IF EXISTS user_images;
DROP VIEW IF EXISTS user_markers;
DROP VIEW IF EXISTS user_plans;
DROP VIEW IF EXISTS user_categories;
DROP VIEW IF EXISTS user_users;
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS markers;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-------- TABLES --------

---- CREATE USERS TABLE

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT,
  company TEXT,
  country TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'starter',
  billing_cycle_start TIMESTAMPTZ,
  billing_cycle_end TIMESTAMPTZ,
  reports_this_billing_cycle INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- note, no synced_at, as this is only relevant locally on a per-device basis
  deleted_at TIMESTAMPTZ
);

---- CREATE CATEGORIES TABLE

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  category_name TEXT NOT NULL,
  user_id UUID NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- note, no synced_at, as this is only relevant locally on a per-device basis
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

---- CREATE PLANS TABLE

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  pdf_filename TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- note, no synced_at, as this is only relevant locally on a per-device basis
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

---- CREATE MARKERS TABLE

CREATE TABLE IF NOT EXISTS markers (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  page_number INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  reference NUMERIC NOT NULL CHECK (reference >= 0),
  category_id UUID,
  description TEXT,
  severity INTEGER,
  extent INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- note, no synced_at, as this is only relevant locally on a per-device basis
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

---- CREATE IMAGES TABLE

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY,
  marker_id UUID NOT NULL,
  image_filename TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- note, no synced_at, as this is only relevant locally on a per-device basis
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (marker_id) REFERENCES markers(id) ON DELETE CASCADE
);

-------- RLS --------

---- CREATE USERS POLICY (to allow authenticated users to access their own records, and allow nobody else to access them)

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_policy
ON public.users
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    id = (SELECT auth.uid())
)
WITH CHECK (
    id = (SELECT auth.uid())
);

---- CREATE CATEGORIES POLICY (to allow authenticated users to access their own records, and allow nobody else to access them)

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_policy
ON public.categories
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    user_id = (SELECT auth.uid())
)
WITH CHECK (
    user_id = (SELECT auth.uid())
);

---- CREATE PLANS POLICY (to allow authenticated users to access their own records, and allow nobody else to access them)

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_policy
ON public.plans
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    user_id = (SELECT auth.uid())
)
WITH CHECK (
    user_id = (SELECT auth.uid())
);

---- CREATE MARKERS POLICY (to allow authenticated users to access their own records, and allow nobody else to access them)

ALTER TABLE public.markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY markers_policy
ON public.markers
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM plans
        WHERE plans.id = markers.plan_id
        AND plans.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM plans
        WHERE plans.id = markers.plan_id
        AND plans.user_id = (SELECT auth.uid())
    )
);

---- CREATE IMAGES POLICY (to allow authenticated users to access their own records, and allow nobody else to access them)

ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

CREATE POLICY images_policy
ON public.images
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM markers m
        JOIN plans p ON m.plan_id = p.id
        WHERE m.id = images.marker_id
        AND p.user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM markers m
        JOIN plans p ON m.plan_id = p.id
        WHERE m.id = images.marker_id
        AND p.user_id = (SELECT auth.uid())
    )
);

-------- VIEWS --------

---- CREATE USERS VIEW (filtered to current authenticated user)

/* 
We are setting up nested user_... views, eventually leading back to auth.uid().
*/
CREATE VIEW user_users
WITH (security_invoker = on) AS -- security invoker means RLS of the main tables is inherited by the views
  SELECT *
  FROM users
  WHERE id = (SELECT auth.uid()); -- "(SELECT auth.uid())" instead of just "auth.uid()" aids performance

---- CREATE CATEGORIES VIEW

/* 
We are setting up nested user_... views, eventually leading back to auth.uid().
*/
CREATE VIEW user_categories
WITH (security_invoker = on) AS -- security invoker means RLS of the main tables is inherited by the views
  SELECT c.*
  FROM categories c
  JOIN user_users u ON c.user_id = u.id;

---- CREATE PLANS VIEW

/* 
We are setting up nested user_... views, eventually leading back to auth.uid().
*/
CREATE VIEW user_plans
WITH (security_invoker = on) AS -- security invoker means RLS of the main tables is inherited by the views
  SELECT p.*
  FROM plans p
  JOIN user_users u ON p.user_id = u.id;

---- CREATE MARKERS VIEW

/* 
We are setting up nested user_... views, eventually leading back to auth.uid().
*/
CREATE VIEW user_markers
WITH (security_invoker = on) AS -- security invoker means RLS of the main tables is inherited by the views
  SELECT m.*
  FROM markers m
  JOIN user_plans p ON m.plan_id = p.id; -- we are setting up nested user_... views, eventually leading back to auth.uid()

---- CREATE IMAGES VIEW

/* 
We are setting up nested user_... views, eventually leading back to auth.uid().
*/
CREATE VIEW user_images
WITH (security_invoker = on) AS -- security invoker means RLS of the main tables is inherited by the views
  SELECT i.*
  FROM images i
  JOIN user_markers m ON i.marker_id = m.id; -- we are setting up nested user_... views, eventually leading back to auth.uid()