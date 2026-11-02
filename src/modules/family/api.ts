import { unwrap } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type FamilyRole = 'admin' | 'member'

export interface Profile {
  id: string
  display_name: string
  avatar_data: string | null
}

export interface Membership {
  family_id: string
  role: FamilyRole
  joined_at: string
  family: { id: string; name: string; created_at: string } | null
}

export interface Member {
  user_id: string
  role: FamilyRole
  joined_at: string
  profile: Profile | null
}

export interface Invite {
  id: string
  family_id: string
  note: string | null
  max_uses: number
  use_count: number
  expires_at: string
  revoked_at: string | null
  created_by: string | null
  created_at: string
}

export interface InvitePreview {
  status: 'valid' | 'expired' | 'revoked' | 'used' | 'invalid' | 'already_member'
  family_name?: string
  invited_by?: string | null
  expires_at?: string
  family_id?: string | null
}

export async function fetchMemberships(userId: string): Promise<Membership[]> {
  const rows = unwrap(
    await supabase
      .from('family_members')
      .select('family_id, role, joined_at, family:families(id, name, created_at)')
      .eq('user_id', userId)
      .order('joined_at'),
  )
  return rows as unknown as Membership[]
}

export async function fetchMembers(familyId: string): Promise<Member[]> {
  const rows = unwrap(
    await supabase
      .from('family_members')
      .select('user_id, role, joined_at, profile:profiles(id, display_name, avatar_data)')
      .eq('family_id', familyId)
      .order('joined_at'),
  )
  return rows as unknown as Member[]
}

export async function createFamily(name: string): Promise<string> {
  return unwrap(await supabase.rpc('create_family', { p_name: name.trim() })) as string
}

export async function renameFamily(familyId: string, name: string): Promise<void> {
  unwrap(await supabase.from('families').update({ name: name.trim() }).eq('id', familyId))
}

export async function createInvite(
  familyId: string,
  options: { maxUses?: number; validDays?: number; note?: string } = {},
): Promise<{ invite_id: string; token: string; expires_at: string }> {
  return unwrap(
    await supabase.rpc('create_family_invite', {
      p_family_id: familyId,
      p_max_uses: options.maxUses ?? 1,
      p_valid_days: options.validDays ?? 7,
      p_note: options.note ?? null,
    }),
  ) as { invite_id: string; token: string; expires_at: string }
}

export async function fetchActiveInvites(familyId: string): Promise<Invite[]> {
  const rows = unwrap(
    await supabase
      .from('family_invites')
      .select('id, family_id, note, max_uses, use_count, expires_at, revoked_at, created_by, created_at')
      .eq('family_id', familyId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  )
  return (rows as Invite[]).filter((i) => i.use_count < i.max_uses)
}

export async function revokeInvite(inviteId: string): Promise<void> {
  unwrap(await supabase.rpc('revoke_family_invite', { p_invite_id: inviteId }))
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  return unwrap(await supabase.rpc('get_invite_preview', { p_token: token })) as InvitePreview
}

export async function acceptInvite(token: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_family_invite', { p_token: token })) as string
}

export async function leaveFamily(familyId: string): Promise<void> {
  unwrap(await supabase.rpc('leave_family', { p_family_id: familyId }))
}

export async function removeMember(familyId: string, userId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_family_member', { p_family_id: familyId, p_user_id: userId }))
}

export async function setMemberRole(familyId: string, userId: string, role: FamilyRole): Promise<void> {
  unwrap(await supabase.rpc('set_family_member_role', { p_family_id: familyId, p_user_id: userId, p_role: role }))
}

export async function deleteFamily(familyId: string, confirmName: string): Promise<void> {
  unwrap(await supabase.rpc('delete_family', { p_family_id: familyId, p_confirm_name: confirmName }))
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const row = unwrap(
    await supabase.from('profiles').select('id, display_name, avatar_data').eq('id', userId).maybeSingle(),
  )
  return row as Profile | null
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'avatar_data'>>,
): Promise<void> {
  unwrap(await supabase.from('profiles').update(patch).eq('id', userId))
}

/** Link de convite completo para compartilhar. */
export function inviteLink(token: string): string {
  return `${window.location.origin}/convite/${encodeURIComponent(token)}`
}
