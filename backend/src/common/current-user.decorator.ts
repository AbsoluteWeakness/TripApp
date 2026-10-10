import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Guard кладёт { userId } в req.user (см. JwtStrategy.validate) — этот декоратор его достаёт
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user.userId;
});
