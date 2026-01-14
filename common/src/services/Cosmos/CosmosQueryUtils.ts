import {
  CosmosQuery,
  FilterCondition,
  QueryParams,
  SortConfig,
} from "../../types/query.types";

/**
 * Build Cosmos DB query from generic query parameters
 */
export class CosmosQueryBuilder<T = any> {
  private baseQuery = "SELECT * FROM c";
  private whereClauses: string[] = [];
  private parameters: Array<{ name: string; value: any }> = [];
  private paramCounter = 0;
  private sortClause?: string;

  /**
   * Add partition key filter (required for efficient queries)
   */
  addPartitionKeyFilter(partitionKey: string, value: string): this {
    this.addFilter({
      field: partitionKey,
      operator: "eq",
      value,
    });
    return this;
  }

  /**
   * Add filter condition
   */
  addFilter(filter: FilterCondition<T>): this {
    const paramName = `@param${this.paramCounter++}`;
    const clause = this.buildFilterClause(filter, paramName);

    if (clause) {
      this.whereClauses.push(clause);
      this.parameters.push({ name: paramName, value: filter.value });
    }

    return this;
  }

  /**
   * Add multiple filters (AND logic)
   */
  addFilters(filters: FilterCondition<T>[]): this {
    filters.forEach((filter) => this.addFilter(filter));
    return this;
  }

  /**
   * Add search query across multiple fields (OR logic)
   */
  addSearch(query: string, fields: string[]): this {
    if (!query?.trim() || !fields?.length) {
      return this;
    }

    const searchValue = query.toLowerCase().trim();
    const searchClauses = fields.map((field) => {
      const paramName = `@search${this.paramCounter++}`;
      this.parameters.push({ name: paramName, value: searchValue });
      return `CONTAINS(LOWER(c.${field}), ${paramName})`;
    });

    if (searchClauses.length > 0) {
      this.whereClauses.push(`(${searchClauses.join(" OR ")})`);
    }

    return this;
  }

  /**
   * Add sort configuration
   */
  addSort(sort: SortConfig<T>): this {
    const order = sort.order === "asc" ? "ASC" : "DESC";
    this.sortClause = `ORDER BY c.${String(sort.field)} ${order}`;
    return this;
  }

  /**
   * Build final Cosmos DB query
   */
  build(): CosmosQuery {
    let query = this.baseQuery;

    if (this.whereClauses.length > 0) {
      query += ` WHERE ${this.whereClauses.join(" AND ")}`;
    }

    if (this.sortClause) {
      query += ` ${this.sortClause}`;
    }

    return {
      query,
      parameters: this.parameters,
    };
  }

  /**
   * Build filter clause based on operator
   */
  private buildFilterClause(
    filter: FilterCondition<T>,
    paramName: string,
  ): string {
    const field = `c.${String(filter.field)}`;

    switch (filter.operator) {
      case "eq":
        return `${field} = ${paramName}`;
      case "ne":
        return `${field} != ${paramName}`;
      case "gt":
        return `${field} > ${paramName}`;
      case "gte":
        return `${field} >= ${paramName}`;
      case "lt":
        return `${field} < ${paramName}`;
      case "lte":
        return `${field} <= ${paramName}`;
      case "contains":
        // Use LOWER for case-insensitive comparison
        return `CONTAINS(LOWER(${field}), LOWER(${paramName}))`;
      case "in":
        return `ARRAY_CONTAINS(${paramName}, ${field})`;
      case "array_contains":
        return `ARRAY_CONTAINS(${field}, ${paramName})`;
      default:
        return "";
    }
  }
}

/**
 * Execute generic Cosmos DB query with pagination
 */
export async function executeCosmosQuery<T>(
  container: any, // Container from @azure/cosmos
  partitionKey: string,
  partitionValue: string,
  queryParams: QueryParams<T>,
  defaultSort: SortConfig<T> = { field: "createdAt", order: "desc" },
): Promise<{ items: T[]; continuationToken?: string; hasMore: boolean }> {
  const builder = new CosmosQueryBuilder<T>();

  // Add partition key filter (required for efficient queries)
  builder.addPartitionKeyFilter(partitionKey, partitionValue);

  // Add custom filters
  if (queryParams.filters?.length) {
    builder.addFilters(queryParams.filters);
  }

  // Add search
  if (queryParams.search?.query && queryParams.search?.fields) {
    builder.addSearch(
      queryParams.search.query,
      queryParams.search.fields as string[],
    );
  }

  // Add sort
  builder.addSort(queryParams.sort || defaultSort);

  // Build query
  const { query, parameters } = builder.build();

  // Execute query with pagination
  const limit = Math.min(queryParams.limit || 20, 100);
  const queryIterator = container.items.query(
    { query, parameters },
    {
      maxItemCount: limit,
      continuationToken: queryParams.continuationToken,
    },
  );

  const { resources, continuationToken, hasMoreResults } =
    await queryIterator.fetchNext();

  return {
    items: resources,
    continuationToken,
    hasMore: hasMoreResults,
  };
}
