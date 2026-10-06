-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'FROZEN');

-- CreateEnum
CREATE TYPE "audit_actor" AS ENUM ('admin', 'user', 'system');

-- CreateEnum
CREATE TYPE "audit_category" AS ENUM ('signin', 'admin', 'emergency');

-- CreateEnum
CREATE TYPE "recovery_kind" AS ENUM ('RECOVERY', 'ESCROW');

-- CreateEnum
CREATE TYPE "recovery_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'USED');

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role_id" UUID NOT NULL,
    "is_super" BOOLEAN NOT NULL DEFAULT false,
    "status" "admin_status" NOT NULL DEFAULT 'INVITED',
    "invite_hash" TEXT,
    "invite_expires_at" TIMESTAMPTZ(3),
    "invited_by" UUID,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_keys" (
    "id" TEXT NOT NULL,
    "admin_id" UUID NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invites" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "actor_type" "audit_actor" NOT NULL,
    "actor_id" UUID,
    "actor_label" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" "audit_category" NOT NULL,
    "target_id" TEXT,
    "target_label" TEXT,
    "reason" TEXT,
    "device" TEXT,
    "ip" TEXT,
    "result" TEXT NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_keys" (
    "user_id" UUID NOT NULL,
    "kind" "recovery_kind" NOT NULL,
    "sealed_key" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_keys_pkey" PRIMARY KEY ("user_id","kind")
);

-- CreateTable
CREATE TABLE "recovery_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "recovery_status" NOT NULL DEFAULT 'PENDING',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "available_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admins_invite_hash_key" ON "admins"("invite_hash");

-- CreateIndex
CREATE INDEX "admin_keys_admin_id_idx" ON "admin_keys"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invites_email_key" ON "user_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_hash_key" ON "audit_log"("hash");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "recovery_requests_user_id_idx" ON "recovery_requests"("user_id");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_keys" ADD CONSTRAINT "admin_keys_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_keys" ADD CONSTRAINT "recovery_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: rules Prisma's schema language can't express.

-- At most one super admin, enforced by the database.
CREATE UNIQUE INDEX "admins_one_super" ON "admins" ("is_super") WHERE "is_super";

-- The audit log is append-only.
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- Built-in roles (BUILT_IN_ROLES in @rahasya/config).
INSERT INTO "admin_roles" ("id", "name", "permissions", "built_in") VALUES
  (gen_random_uuid(), 'Owner', ARRAY['users.view', 'users.manage', 'recovery', 'decrypt', 'audit.view', 'admins.manage'], true),
  (gen_random_uuid(), 'Admin', ARRAY['users.view', 'users.manage', 'recovery', 'audit.view'], true),
  (gen_random_uuid(), 'Auditor', ARRAY['users.view', 'audit.view'], true);
