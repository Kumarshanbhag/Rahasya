-- CreateTable
CREATE TABLE "vault_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_id" UUID,
    "blob" BYTEA,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_history" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "blob" BYTEA NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "name_enc" BYTEA NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name_enc" BYTEA NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_labels" (
    "item_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "item_labels_pkey" PRIMARY KEY ("item_id","label_id")
);

-- CreateIndex
CREATE INDEX "vault_items_user_id_revision_idx" ON "vault_items"("user_id", "revision");

-- CreateIndex
CREATE INDEX "vault_items_deleted_at_idx" ON "vault_items"("deleted_at");

-- CreateIndex
CREATE INDEX "item_history_item_id_revision_idx" ON "item_history"("item_id", "revision");

-- CreateIndex
CREATE INDEX "item_history_created_at_idx" ON "item_history"("created_at");

-- CreateIndex
CREATE INDEX "groups_user_id_revision_idx" ON "groups"("user_id", "revision");

-- CreateIndex
CREATE INDEX "labels_user_id_revision_idx" ON "labels"("user_id", "revision");

-- CreateIndex
CREATE INDEX "item_labels_label_id_idx" ON "item_labels"("label_id");

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_labels" ADD CONSTRAINT "item_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
