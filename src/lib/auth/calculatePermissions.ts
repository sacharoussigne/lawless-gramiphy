import { checkRolePermission } from './permissions';
import type { Permissions } from '@/types/permissions';

/**
 * Calcule toutes les permissions pour un rôle donné
 * @param role Le rôle de l'utilisateur
 * @returns Les permissions calculées ou null si pas de rôle
 */
export function calculatePermissions(role: string | null | undefined): Permissions | null {
  if (!role) {
    return null;
  }

  return {
    settings: {
      access: checkRolePermission(role, 'settings', 'access'),
    },
    gramophone: {
      access: checkRolePermission(role, 'gramophone', 'access'),
      manage: checkRolePermission(role, 'gramophone', 'manage'),
    },
  };
}

