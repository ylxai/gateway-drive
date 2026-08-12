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
 * Collect [folderId, parentId, grandparentId, ...] up to the root. The list is
 * used both for folder-invite matching and (indirectly) file access checks.
 */
async function resolveFolderChain(folderId: string | null): Promise<string[]> {
  const chain: string[] = []
  let currentId = folderId
  let guard = 0
  while (currentId && guard < 50) {
    const folder = await prisma.folder.findFirst({
      where: { id: currentId },
      select: { parentId: true },
    })
    if (!folder) break
    chain.push(currentId)
    currentId = folder.parentId
    guard += 1
  }
  return chain
}

/**
 * Expand a set of folder ids to include every descendant folder id. Used so
 * the shared=1 file listing matches the folder-chain access resolution in
 * resolveFileAccess (a file inside a subfolder of an invited folder is
 * accessible, so it must appear in the listing too).
 */
export async function expandFolderDescendants(folderIds: string[]): Promise<string[]> {
  if (folderIds.length === 0) return []
  const all = new Set(folderIds)
  let changed = true
  let guard = 0
  while (changed && guard < 100) {
    changed = false
    const children = await prisma.folder.findMany({ where: { parentId: { in: [...all] }, deletedAt: null }, select: { id: true } })
    for (const child of children) {
      if (!all.has(child.id)) {
        all.add(child.id)
        changed = true
      }
    }
    guard += 1
  }
  return [...all]
}
