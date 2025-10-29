  -- Create User table
  CREATE TABLE IF NOT EXISTS "User" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Create Domain table
  CREATE TABLE IF NOT EXISTS "Domain" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "adminEmail" TEXT UNIQUE NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Create Artwork table
  CREATE TABLE IF NOT EXISTS "Artwork" (
      id TEXT PRIMARY KEY,
      "domainId" TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      "originalBlob" TEXT,
      filename TEXT,
      "contentType" TEXT,
      size INTEGER,
      checksum TEXT,
      "metadataJson" TEXT,
      "thumbnailJson" TEXT,
      "isIndexed" BOOLEAN NOT NULL DEFAULT false,
      "indexingError" TEXT,
      "lastIndexedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("domainId") REFERENCES "Domain"(id) ON DELETE CASCADE
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS "idx_artwork_domain_id" ON "Artwork"("domainId");
  CREATE INDEX IF NOT EXISTS "idx_artwork_is_indexed" ON "Artwork"("isIndexed");
  CREATE INDEX IF NOT EXISTS "idx_domain_admin_email" ON "Domain"("adminEmail");
  CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"(email);

  -- Insert a default admin user if not exists
  INSERT INTO "User" (id, name, email, role, "createdAt", "updatedAt")
  SELECT 'galrubin-admin', 'System Admin', 'galrubin15@gmail.com', 'global_admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'galrubin15@gmail.com');
