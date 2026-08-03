import { NextResponse } from 'next/server';
import { listFirestoreOperators } from '@/lib/firestore-operators';

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
    const operators = await listFirestoreOperators();
return NextResponse.json({ operators, cloud_backend: 'firebase' });
    
  } catch (error) {
    console.error('operators api failed', error);
    return NextResponse.json({ error: 'Unable to load operators' }, { status: 500 });
  }
}
