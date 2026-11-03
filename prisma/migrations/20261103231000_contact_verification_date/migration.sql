-- Contact.lastVerified is already part of the Prisma model and admin setup.
-- Make fresh deployments match that model without changing existing dates.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastVerified" TIMESTAMP(3);
