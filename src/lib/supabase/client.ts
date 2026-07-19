import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  import.meta.env
    .PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Falta PUBLIC_SUPABASE_URL.",
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    "Falta PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
);