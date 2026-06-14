import { Injectable } from '@zeltjs/core';

import type { Gql } from '../generated/graphql';

@Injectable()
export class CatalogService {
  findProduct(id: string): Gql.Product | undefined {
    if (id !== 'p_lamp') return undefined;
    return { id, name: 'Desk Lamp' };
  }
}
