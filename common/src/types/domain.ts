export interface Domain {
  id: string; // UUID
  name: string;
  adminEmail: string;
  createdAt?: number; // timestamp
  updatedAt?: number; // timestamp
}