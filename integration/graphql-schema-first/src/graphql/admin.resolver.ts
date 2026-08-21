import { Query, Resolver } from '@zeltjs/graphql';

import type { Gql } from '../generated/admin';

@Resolver()
export class AdminResolver {
  @Query()
  orderCount(): Gql.Query.orderCount.Result {
    return 3;
  }
}
