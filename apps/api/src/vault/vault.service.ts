import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GROUP_MAX_DEPTH, HISTORY_RETENTION_MS, PASSWORD_HISTORY_MAX, TRASH_RETENTION_MS } from '@rahasya/config';
import { b64, bytes } from '../common/bytes';
import type { Group, Label, Prisma, VaultItem } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import type { GroupInput, LabelInput, PutItemDto } from './vault.dto';

type Tx = Prisma.TransactionClient;

const toItem = (i: VaultItem & { labels: { labelId: string }[] }) => ({
  id: i.id,
  groupId: i.groupId,
  labelIds: i.labels.map((l) => l.labelId),
  blob: i.blob && b64(i.blob), // null = deleted forever
  revision: i.revision,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  deletedAt: i.deletedAt,
});
const toGroup = (g: Group) => ({
  id: g.id,
  parentId: g.parentId,
  nameEnc: b64(g.nameEnc),
  sortOrder: g.sortOrder,
  revision: g.revision,
  createdAt: g.createdAt,
  deletedAt: g.deletedAt,
});
const toLabel = (l: Label) => ({ id: l.id, nameEnc: b64(l.nameEnc), revision: l.revision, createdAt: l.createdAt, deletedAt: l.deletedAt });

function uniqueIds(input: { id: string }[]) {
  const ids = input.map((x) => x.id);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate ids in one request');
  return ids;
}

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bumps the user's change counter. Its row lock serialises one user's writes, and the new value
   * stamps every row the transaction touches. Call it first, before reading what you'll change.
   */
  private async nextRevision(tx: Tx, userId: string) {
    const user = await tx.user.update({ where: { id: userId }, data: { revision: { increment: 1 } }, select: { revision: true } });
    return user.revision;
  }

  // ---- sync: everything changed since the device last asked ----

  async sync(userId: string, since: number) {
    // The counter and the rows it stamps commit together, so every row at or below the value read here is visible.
    const { revision } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { revision: true } });
    // A client ahead of the server (say, after a database restore) gets a full snapshot to replace its cache.
    const full = since === 0 || since > revision;
    const where = { userId, revision: { gt: full ? 0 : since, lte: revision } };
    const [items, groups, labels] = await Promise.all([
      this.prisma.vaultItem.findMany({ where, include: { labels: { select: { labelId: true } } }, orderBy: { revision: 'asc' } }),
      this.prisma.group.findMany({ where, orderBy: { revision: 'asc' } }),
      this.prisma.label.findMany({ where, orderBy: { revision: 'asc' } }),
    ]);
    return { revision, full, items: items.map(toItem), groups: groups.map(toGroup), labels: labels.map(toLabel) };
  }

  // ---- saving entries (new or edited) ----

  putItem(userId: string, id: string, dto: PutItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      const existing = await this.findItem(tx, userId, id);
      const groupId = dto.groupId ?? null;
      const labelIds = [...new Set(dto.labelIds ?? [])];
      await this.assertRefs(tx, userId, groupId, labelIds);
      const blob = bytes(dto.blob);
      if (existing) {
        // Newest write wins; the version it replaces goes to history, so a conflict never loses data.
        await tx.itemHistory.create({ data: { itemId: id, blob: existing.blob!, revision: existing.revision } });
        await this.trimHistory(tx, id);
        await tx.vaultItem.update({ where: { id }, data: { blob, groupId, revision } });
        await tx.itemLabel.deleteMany({ where: { itemId: id } });
      } else {
        await tx.vaultItem.create({ data: { id, userId, blob, groupId, revision } });
      }
      if (labelIds.length) await tx.itemLabel.createMany({ data: labelIds.map((labelId) => ({ itemId: id, labelId })) });
      const conflict = !!existing && dto.baseRevision !== undefined && dto.baseRevision !== existing.revision;
      return { id, revision, conflict };
    });
  }

  /** The caller's entry, or null for a new id. 404 when it belongs to someone else, 410 once deleted forever. */
  private async findItem(tx: Tx, userId: string, id: string) {
    const item = await tx.vaultItem.findUnique({ where: { id } });
    if (item && item.userId !== userId) throw new NotFoundException('Entry not found');
    if (item && !item.blob) throw new GoneException('This entry was deleted forever');
    return item;
  }

  private async mustFindItem(tx: Tx, userId: string, id: string) {
    const item = await this.findItem(tx, userId, id);
    if (!item) throw new NotFoundException('Entry not found');
    return item;
  }

  private async assertRefs(tx: Tx, userId: string, groupId: string | null, labelIds: string[]) {
    if (groupId && !(await tx.group.count({ where: { id: groupId, userId, deletedAt: null } }))) {
      throw new BadRequestException('Group not found');
    }
    if (labelIds.length && (await tx.label.count({ where: { id: { in: labelIds }, userId, deletedAt: null } })) !== labelIds.length) {
      throw new BadRequestException('Label not found');
    }
  }

  private async trimHistory(tx: Tx, itemId: string) {
    const old = await tx.itemHistory.findMany({ where: { itemId }, orderBy: { revision: 'desc' }, skip: PASSWORD_HISTORY_MAX, select: { id: true } });
    if (old.length) await tx.itemHistory.deleteMany({ where: { id: { in: old.map((h) => h.id) } } });
  }

  // ---- older versions: password history and reviewing a conflict ----

  async history(userId: string, id: string) {
    if (!(await this.prisma.vaultItem.count({ where: { id, userId } }))) throw new NotFoundException('Entry not found');
    const rows = await this.prisma.itemHistory.findMany({ where: { itemId: id }, orderBy: { revision: 'desc' } });
    return rows.map((h) => ({ revision: h.revision, blob: b64(h.blob), replacedAt: h.createdAt }));
  }

  // ---- Trash ----

  trashItem(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      const item = await this.mustFindItem(tx, userId, id);
      const { deletedAt } = await tx.vaultItem.update({
        where: { id },
        data: { deletedAt: item.deletedAt ?? new Date(), revision },
        select: { deletedAt: true },
      });
      return { id, revision, deletedAt };
    });
  }

  /** The Undo toast and Trash → Restore: the entry comes back exactly as it was. */
  restoreItem(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      await this.mustFindItem(tx, userId, id);
      await tx.vaultItem.update({ where: { id }, data: { deletedAt: null, revision } });
      return { id, revision };
    });
  }

  purgeItem(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      const item = await this.mustFindItem(tx, userId, id);
      if (!item.deletedAt) throw new BadRequestException('Move the entry to Trash first');
      await this.purge(tx, [id], revision);
      return { id, revision };
    });
  }

  /** Deleted forever: the ciphertext, its history and its label links go; a tombstone row tells the other devices. */
  private async purge(tx: Tx, ids: string[], revision: number) {
    await tx.itemHistory.deleteMany({ where: { itemId: { in: ids } } });
    await tx.itemLabel.deleteMany({ where: { itemId: { in: ids } } });
    await tx.vaultItem.updateMany({ where: { id: { in: ids } }, data: { blob: null, groupId: null, revision } });
  }

  /** Trash keeps entries 30 days; history keeps replaced versions 30 days. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(now = new Date()) {
    const trashCutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
    const due = await this.prisma.vaultItem.findMany({
      where: { deletedAt: { lt: trashCutoff }, blob: { not: null } },
      select: { id: true, userId: true },
    });
    for (const [userId, items] of Map.groupBy(due, (i) => i.userId)) {
      await this.prisma.$transaction(async (tx) => {
        const revision = await this.nextRevision(tx, userId);
        // Re-check under the user's lock: an entry restored a moment ago must not be purged.
        const still = await tx.vaultItem.findMany({
          where: { id: { in: items.map((i) => i.id) }, deletedAt: { lt: trashCutoff }, blob: { not: null } },
          select: { id: true },
        });
        await this.purge(tx, still.map((i) => i.id), revision);
      });
    }
    await this.prisma.itemHistory.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - HISTORY_RETENTION_MS) } } });
  }

  // ---- groups (folders, up to 3 deep) and labels (tags) ----

  async listGroups(userId: string) {
    const groups = await this.prisma.group.findMany({ where: { userId, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
    return groups.map(toGroup);
  }

  putGroups(userId: string, input: GroupInput[]) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      const ids = uniqueIds(input);
      if (await tx.group.count({ where: { id: { in: ids }, NOT: { userId } } })) throw new NotFoundException('Group not found');

      // Check the whole resulting tree: moving one group can push its subgroups past the depth limit.
      const current = await tx.group.findMany({ where: { userId }, select: { id: true, parentId: true, deletedAt: true } });
      const tree = new Map(current.map((g) => [g.id, { parentId: g.parentId, deleted: !!g.deletedAt }]));
      for (const g of input) tree.set(g.id, { parentId: g.parentId ?? null, deleted: !!g.deleted });
      for (const [id, node] of tree) {
        if (node.deleted) continue;
        let depth = 0;
        for (let at: string | null = id; at; at = tree.get(at)?.parentId ?? null) {
          const n = tree.get(at);
          if (!n || n.deleted) throw new BadRequestException('Parent group not found; move or delete its subgroups first');
          if (++depth > GROUP_MAX_DEPTH) throw new BadRequestException(`Groups nest at most ${GROUP_MAX_DEPTH} levels`);
        }
      }

      const now = new Date();
      for (const g of input) {
        const data = { parentId: g.parentId ?? null, nameEnc: bytes(g.nameEnc), sortOrder: g.sortOrder, revision, deletedAt: g.deleted ? now : null };
        await tx.group.upsert({ where: { id: g.id }, create: { id: g.id, userId, ...data }, update: data });
      }
      // Entries left in a deleted group fall back to Unsorted (the client normally moves them first).
      const gone = input.filter((g) => g.deleted).map((g) => g.id);
      if (gone.length) await tx.vaultItem.updateMany({ where: { userId, groupId: { in: gone } }, data: { groupId: null, revision } });
      return { revision };
    });
  }

  async listLabels(userId: string) {
    const labels = await this.prisma.label.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return labels.map(toLabel);
  }

  putLabels(userId: string, input: LabelInput[]) {
    return this.prisma.$transaction(async (tx) => {
      const revision = await this.nextRevision(tx, userId);
      const ids = uniqueIds(input);
      if (await tx.label.count({ where: { id: { in: ids }, NOT: { userId } } })) throw new NotFoundException('Label not found');

      const now = new Date();
      for (const l of input) {
        const data = { nameEnc: bytes(l.nameEnc), revision, deletedAt: l.deleted ? now : null };
        await tx.label.upsert({ where: { id: l.id }, create: { id: l.id, userId, ...data }, update: data });
      }
      // A deleted label comes off its entries, which get the new revision so other devices notice.
      const gone = input.filter((l) => l.deleted).map((l) => l.id);
      if (gone.length) {
        const links = await tx.itemLabel.findMany({ where: { labelId: { in: gone } }, select: { itemId: true } });
        await tx.itemLabel.deleteMany({ where: { labelId: { in: gone } } });
        await tx.vaultItem.updateMany({ where: { id: { in: links.map((l) => l.itemId) } }, data: { revision } });
      }
      return { revision };
    });
  }
}
