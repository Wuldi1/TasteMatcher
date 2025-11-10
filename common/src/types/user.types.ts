export type Role = 'global_admin' | 'domain_owner' | 'dealer' | 'customer';

export interface User {
  id: string;
  domainId: string;
  name: string;
  email: string;
  role: Role;
  preferenceVector: number[];
  createdAt: number;
  updatedAt: number;
}