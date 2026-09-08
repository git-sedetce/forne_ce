import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserService } from '../user.service';

export const roleGuard: CanActivateFn = (route, state) => {

  const userService = inject(UserService);
  const router = inject(Router);

  const roles = route.data['roles'] as number[];

  if (userService.hasRole(roles)) {
    return true;
  }

  return router.createUrlTree(['/acesso-negado']);
};
