/**
 * Generic filter operator
 */
export type FilterOperator = 
  | 'eq'      // equals
  | 'ne'      // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'contains' // string contains
  | 'in'      // value in array
  | 'array_contains'; // array contains value

/**
 * Generic filter condition
 */
export interface FilterCondition<T = any> {
  field: keyof T | string;
  operator: FilterOperator;
  value: any;
}

/**
 * Generic sort configuration
 */
export interface SortConfig<T = any> {
  field: keyof T | string;
  order: 'asc' | 'desc';
}

/**
 * Generic query parameters
 */
export interface QueryParams<T = any> {
  /** Maximum items per page (default: 20, max: 100) */
  limit?: number;
  /** Continuation token for pagination */
  continuationToken?: string;
  /** Sort configuration */
  sort?: SortConfig<T>;
  /** Filter conditions (AND logic) */
  filters?: FilterCondition<T>[];
  /** Search query (searches across multiple fields) */
  search?: {
    query: string;
    fields: (keyof T | string)[];
  };
}

/**
 * Generic paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  continuationToken?: string;
  hasMore: boolean;
  total?: number;
}

/**
 * Query builder result for Cosmos DB
 */
export interface CosmosQuery {
  query: string;
  parameters: Array<{ name: string; value: any }>;
}
