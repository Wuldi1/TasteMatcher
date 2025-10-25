export type UserId = string;

export type Role = 'global_admin' | 'domain_owner' | 'dealer' | 'customer';

export interface User {
  id: UserId;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}