import { Controller, Get, middlewareValue, UseMiddleware } from '@zeltjs/core';

import { adminAuth, memberAuth } from './user-auth.middleware';

// Doc's adminAuth scenario: the const bound at the class is the same const
// read via middlewareValue() in the handler.
@UseMiddleware(adminAuth)
@Controller('/options/admin')
export class AdminBoundController {
  @Get('/me')
  me() {
    const admin = middlewareValue(adminAuth);
    return { id: admin.id, role: admin.role };
  }
}

// A second, independent binding of the same UserAuthMiddleware class.
// Verifies that two .with() calls on one class don't share values/options.
@UseMiddleware(memberAuth)
@Controller('/options/member')
export class MemberBoundController {
  @Get('/me')
  me() {
    const member = middlewareValue(memberAuth);
    return { id: member.id, role: member.role };
  }
}

// Both bindings applied to the same route: each must resolve independently
// within a single request, not collide because they share a class.
@Controller('/options/both')
export class BothBoundController {
  @Get('/me')
  @UseMiddleware(adminAuth)
  @UseMiddleware(memberAuth)
  me() {
    const admin = middlewareValue(adminAuth);
    const member = middlewareValue(memberAuth);
    return { admin, member };
  }
}

// Only memberAuth is applied here; reading adminAuth's value must fail
// because that exact binding never ran on this route.
@UseMiddleware(memberAuth)
@Controller('/options/member-only')
export class MemberOnlyController {
  @Get('/read-unapplied-binding')
  me() {
    const admin = middlewareValue(adminAuth);
    return { id: admin.id, role: admin.role };
  }
}
