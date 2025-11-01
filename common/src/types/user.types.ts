export type Role = 'global_admin' | 'domain_owner' | 'dealer' | 'customer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}