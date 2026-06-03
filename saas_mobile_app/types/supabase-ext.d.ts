// Augment Supabase's User type with convenience properties
// so that `user?.name` and `user?.avatar` work throughout the app
import type { User as SupabaseUser } from '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface User {
    /** Convenience alias for user_metadata.full_name */
    name?: string;
    /** Convenience alias for user_metadata.avatar_url */
    avatar?: string;
  }
}
