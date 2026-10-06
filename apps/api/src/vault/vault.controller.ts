import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessGuard, type AuthContext, CurrentAuth } from '../auth/access.guard';
import { DeleteItemQuery, PutGroupsDto, PutItemDto, PutLabelsDto, SyncQuery } from './vault.dto';
import { VaultService } from './vault.service';

/** The vault is ciphertext only: the API stores and syncs blobs it can't read. */
@Controller('vault')
@UseGuards(AccessGuard)
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('sync')
  sync(@CurrentAuth() auth: AuthContext, @Query() query: SyncQuery) {
    return this.vault.sync(auth.userId, query.since);
  }

  @Put('items/:id')
  putItem(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PutItemDto) {
    return this.vault.putItem(auth.userId, id, dto);
  }

  /** Moves an entry to Trash; with ?forever=true, permanently deletes one already in Trash. */
  @Delete('items/:id')
  deleteItem(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Query() query: DeleteItemQuery) {
    return query.forever === 'true' ? this.vault.purgeItem(auth.userId, id) : this.vault.trashItem(auth.userId, id);
  }

  @Post('items/:id/restore')
  @HttpCode(200)
  restoreItem(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.vault.restoreItem(auth.userId, id);
  }

  /** Older versions of an entry, for password history and for reviewing an edit that clashed with another device. */
  @Get('items/:id/history')
  history(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.vault.history(auth.userId, id);
  }

  @Get('groups')
  listGroups(@CurrentAuth() auth: AuthContext) {
    return this.vault.listGroups(auth.userId);
  }

  @Put('groups')
  putGroups(@CurrentAuth() auth: AuthContext, @Body() dto: PutGroupsDto) {
    return this.vault.putGroups(auth.userId, dto.groups);
  }

  @Get('labels')
  listLabels(@CurrentAuth() auth: AuthContext) {
    return this.vault.listLabels(auth.userId);
  }

  @Put('labels')
  putLabels(@CurrentAuth() auth: AuthContext, @Body() dto: PutLabelsDto) {
    return this.vault.putLabels(auth.userId, dto.labels);
  }
}
