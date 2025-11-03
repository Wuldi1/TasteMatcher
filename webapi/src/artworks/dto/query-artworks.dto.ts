import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryParams, Artwork, FilterCondition } from '@tastematcher/common';

export class QueryArtworksDto implements QueryParams<Artwork> {
    @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ description: 'Continuation token for pagination' })
    @IsOptional()
    @IsString()
    continuationToken?: string;

    @ApiPropertyOptional({ description: 'Sort by field', enum: ['createdAt', 'title', 'artist'] })
    @IsOptional()
    @IsIn(['createdAt', 'title', 'artist'])
    sortBy?: 'createdAt' | 'title' | 'artist';

    @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'] })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc';

    @ApiPropertyOptional({ description: 'Filter by artist name' })
    @IsOptional()
    @IsString()
    artist?: string;

    @ApiPropertyOptional({ description: 'Filter by tags (comma-separated)' })
    @IsOptional()
    @IsString()
    tags?: string;

    @ApiPropertyOptional({ description: 'Search query in title/description' })
    @IsOptional()
    @IsString()
    searchQuery?: string;

    /**
     * Convert DTO to generic QueryParams
     */
    toQueryParams(): QueryParams<Artwork> {
        const filters: FilterCondition<Artwork>[] = [];

        if (this.artist) {
            filters.push({
                field: 'artist',
                operator: 'contains',
                value: this.artist,
            });
        }

        if (this.tags) {
            const tagList = this.tags.split(',').map(t => t.trim());
            tagList.forEach(tag => {
                filters.push({
                    field: 'tags',
                    operator: 'array_contains',
                    value: tag,
                });
            });
        }

        return {
            limit: this.limit,
            continuationToken: this.continuationToken,
            sort: this.sortBy ? {
                field: this.sortBy,
                order: this.sortOrder || 'desc',
            } : undefined,
            filters: filters.length > 0 ? filters : undefined,
            search: this.searchQuery ? {
                query: this.searchQuery,
                fields: ['title', 'description'],
            } : undefined,
        };
    }
}
