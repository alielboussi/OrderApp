import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

type OperatorRecord = {
  id: string;
  display_name: string;
  name: string;
  email: string;
  auth_user_id: string;
};

function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

function isSupervisorUser(user: { user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null }) {
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  if (typeof role === 'string' && role.trim().toLowerCase() === 'supervisor') {
    return true;
  }
  const roles = user.app_metadata?.roles ?? user.user_metadata?.roles;
  if (Array.isArray(roles)) {
    return roles.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === 'supervisor');
  }
  return false;
}

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      throw error;
    }

    const operators = (data?.users ?? [])
      .filter((user) => !user.is_anonymous && isSupervisorUser(user))
      .map((user) => {
        const metaDisplayName = normalizeDisplayName(user.user_metadata?.display_name);
        const primaryDisplayName = metaDisplayName ?? user.email ?? 'Operator';
        const fallbackName = user.email ?? primaryDisplayName;
        const email = user.email ?? 'operator@afterten.local';
        return {
          id: user.id,
          display_name: primaryDisplayName,
          name: fallbackName,
          email,
          auth_user_id: user.id,
        } satisfies OperatorRecord;
      });

    operators.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));

    return NextResponse.json({ operators });
  } catch (error) {
    console.error('operators api failed', error);
    return NextResponse.json({ error: 'Unable to load operators' }, { status: 500 });
  }
}
