import { LIMITS } from '@rahasya/config';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCiphertext } from '../common/bytes';

export class SyncQuery {
  /** The revision from the last sync; 0 (or none) for everything. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) since = 0;
}

/** PUT replaces the whole entry: a missing groupId means Unsorted, missing labelIds means none. */
export class PutItemDto {
  @IsCiphertext(LIMITS.itemBlobMaxBytes) blob!: string;
  @IsOptional() @IsUUID('all') groupId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(LIMITS.labelsPerItem) @IsUUID('all', { each: true }) labelIds?: string[];
  /** The revision this edit started from; a mismatch is reported back as a conflict. */
  @IsOptional() @IsInt() @Min(0) baseRevision?: number;
}

export class DeleteItemQuery {
  @IsOptional() @IsIn(['true', 'false']) forever?: string;
}

export class GroupInput {
  @IsUUID('all') id!: string;
  @IsOptional() @IsUUID('all') parentId?: string | null;
  @IsCiphertext(LIMITS.nameBlobMaxBytes) nameEnc!: string;
  @IsInt() @Min(0) @Max(2_147_483_647) sortOrder!: number;
  @IsOptional() @IsBoolean() deleted?: boolean;
}

export class PutGroupsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LIMITS.batchMax) @ValidateNested({ each: true }) @Type(() => GroupInput)
  groups!: GroupInput[];
}

export class LabelInput {
  @IsUUID('all') id!: string;
  @IsCiphertext(LIMITS.nameBlobMaxBytes) nameEnc!: string;
  @IsOptional() @IsBoolean() deleted?: boolean;
}

export class PutLabelsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LIMITS.batchMax) @ValidateNested({ each: true }) @Type(() => LabelInput)
  labels!: LabelInput[];
}
