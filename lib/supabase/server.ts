import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client cho Server Components / Route Handlers — đọc session từ cookie. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Được gọi từ Server Component — bỏ qua, middleware sẽ refresh.
          }
        },
      },
    }
  );
}
