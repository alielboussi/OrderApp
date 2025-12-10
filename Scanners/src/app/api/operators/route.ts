import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

const SUPERVISOR_ROLE_ID = 'eef421e0-ce06-4518-93c4-6bb6525f6742';

type UserRoleRow = {
  user_id: string | null;
  display_name: string | null;
};

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

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .eq('role_id', SUPERVISOR_ROLE_ID);

    if (roleError) {
      throw roleError;
    }

    const userIds = Array.from(
      new Set((roleRows ?? []).map((row: UserRoleRow) => row?.user_id).filter((value): value is string => Boolean(value)))
    );

    if (!userIds.length) {
      return NextResponse.json({ operators: [] });
    }

    const operatorResults = await Promise.all(
      userIds.map(async (userId) => {
        const roleRecord = (roleRows ?? []).find((row) => row?.user_id === userId);
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error || !data?.user) {
          console.warn('[operators api] Unable to load auth user', userId, error);
          return null;
        }
        const user = data.user;
        if (user.is_anonymous) {
          return null;
        }
        const roleDisplayName = normalizeDisplayName(roleRecord?.display_name);
        const metaDisplayName = normalizeDisplayName(user.user_metadata?.display_name);
        const primaryDisplayName = roleDisplayName ?? metaDisplayName ?? user.email ?? 'Operator';
        const fallbackName = user.email ?? primaryDisplayName;
        const email = user.email ?? 'operator@afterten.local';
        return {
          id: user.id,
          display_name: primaryDisplayName,
          name: fallbackName,
          email,
          auth_user_id: user.id,
        } satisfies OperatorRecord;
      })
    );

    const operators = operatorResults.filter((entry): entry is OperatorRecord => Boolean(entry));
    operators.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));

    return NextResponse.json({ operators });
  } catch (error) {
    console.error('operators api failed', error);
    return NextResponse.json({ error: 'Unable to load operators' }, { status: 500 });
  }
}
