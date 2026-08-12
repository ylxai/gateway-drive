import { prisma } from '../../config/prisma.js'

export type AccessRole = 'viewer' | 'editor' | 'owner'

/**
 * Resolve the effective access role a user has on a file.
 *
 * - 'owner' when the user owns the file
 * - invite role ('viewer' | 'editor') when the user has an ACCEPTED invite for
 *   the file itself, or for a folder that contains it (direct parent only —
 *   deeper nesting is resolved through the folder chain)
 * - null when the user has no access
 */
export async function resolveFileAccess(userId: string, fileId: string): Promise<AccessRole | null> {
  const file = await prisma.file.findFirst({
    where: { id: fileId },
    select: { userId: true, folderId: true },
  })
  if (!file) return null
  if (file.userId === userId) return 'owner'

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!me?.email) return null

  const folderChain = await resolveFolderChain(file.folderId)
  const fileInvites = await prisma.workspaceInvite.findMany({
    where: {
      inviteeEmail: me.email,
      targetType: 'file',
      targetId: fileId,
      status: 'accepted',
      revokedAt: null,
    },
    select: { role: true },
  })
  if (fileInvites.length > 0) return maxRole(fileInvites.map((invite) => invite.role))

  const folderInvites = await prisma.workspaceInvite.findMany({
    where: {
      inviteeEmail: me.email,
      targetType: 'folder',
      targetId: { in: folderChain },
      status: 'accepted',
      revokedAt: null,
    },
    select: { role: true },
  })
  if (folderInvites.length > 0) return maxRole(folderInvites.map((invite) => invite.role))
  return null
}

/**
 * Resolve the effective access role a user has on a folder.
 * Owner, or the role of an accepted invite targeting that folder or any of its
 * ancestors (an invite to a parent folder grants access to child folders).
 */
export async function resolveFolderAccess(userId: string, folderId: string): Promise<AccessRole | null> {
  const folder = await prisma.folder.findFirst({ where: { id: folderId }, select: { userId: true, parentId: true } })
  if (!folder) return null
  if (folder.userId === userId) return 'owner'

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!me?.email) return null

  const chain = await resolveFolderChain(folderId)
  if (chain.length === 0) return null
  const invites = await prisma.workspaceInvite.findMany({
    where: {
      inviteeEmail: me.email,
      targetType: 'folder',
      targetId: { in: chain },
      status: 'accepted',
      revokedAt: null,
    },
    select: { role: true },
  })
  if (invites.length > 0) return maxRole(invites.map((invite) => invite.role))
  return null
}

/**
 * Highest privilege wins: 'editor' > 'viewer'. Multiple inviters can invite the
 * same user to the same target with different roles, so never rely on row order.
 */
function maxRole(roles: string[]): 'viewer' | 'editor' {
  return roles.some((role) => role === 'editor') ? 'editor' : 'viewer'
}

/**
 * Collect [folderId, parentId, grandparentId, ...] up to the root. A single
 * recursive CTE replaces the previous per-level loop (avoids N+1 queries on
 * deep folder trees). Used for folder-invite matching and file access checks.
 */
async function resolveFolderChain(folderId: string | null): Promise<string[]> {
  if (!folderId) return []
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id FROM folders WHERE id = ${folderId}
      UNION ALL
      SELECT f.id, f.parent_id FROM folders f
        JOIN chain c ON f.id = c.parent_id
    )
    SELECT id FROM chain WHERE id IS NOT NULL LIMIT 200
  `
  return rows.map((row) => row.id)
}

/**
 * Expand a set of folder ids to include every descendant folder id. Used so
 * the shared=1 file listing matches the folder-chain access resolution in
 * resolveFileAccess (a file inside a subfolder of an invited folder is
 * accessible, so it must appear in the listing too). A single recursive CTE
 * avoids the previous per-level loop (N+1 on deep trees).
 */
export async function expandFolderDescendants(folderIds: string[]): Promise<string[]> {
  if (folderIds.length === 0) return []
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE tree AS (
      SELECT id FROM folders WHERE id = ANY(${folderIds}) AND deleted_at IS NULL
      UNION ALL
      SELECT f.id FROM folders f
        JOIN tree t ON f.parent_id = t.id
      WHERE f.deleted_at IS NULL
    )
    SELECT DISTINCT id FROM tree LIMIT 2000
  `
  return rows.map((row) => row.id)
}
