import { createAccessControl } from "better-auth/plugins";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";


const defaultApplicationPermissions = {
    settings: ["access"],
    gramophone: ["access", "manage"],
};
export const statement = {
    ...defaultStatements, // Les permissions par défaut (user, session)

    // Vos ressources personnalisées
    ...defaultApplicationPermissions,
} as const;



const ac = createAccessControl(statement);

const visitor = ac.newRole({
    ...userAc.statements,
    settings: ["access"],
    gramophone: [],
});

const user = ac.newRole({
    ...userAc.statements,
    settings: ["access"],
    gramophone: ["access"],
});

const admin = ac.newRole({
    ...adminAc.statements,
    ...defaultApplicationPermissions,
});

const dj = ac.newRole({
    ...userAc.statements,
    settings: ["access"],
    gramophone: ["access", "manage"],
});

// Map des rôles pour faciliter l'accès
const rolesMap = {
    visitor,
    user,
    admin,
    dj,
} as const;

/**
 * Checks whether a user role has a given permission, using the in-memory roles map
 * (faster than calling Better Auth at runtime).
 */
export function checkRolePermission(
    roleName: string | null | undefined,
    resource: keyof typeof statement,
    action: string
): boolean {
    if (!roleName) {
        return false;
    }

    const roles = roleName.split(",").map((r) => r.trim()).filter((r) => r.length > 0);

    for (const role of roles) {
        const roleObj = rolesMap[role as keyof typeof rolesMap];
        if (!roleObj) {
            continue;
        }

        const resourcePermissions = roleObj.statements[resource as keyof typeof roleObj.statements];
        if (!resourcePermissions) {
            continue;
        }

        if (resourcePermissions.includes(action as any)) {
            return true;
        }
    }

    return false;
}

export function hasRole(
    roleName: string | null | undefined,
    roleToCheck: keyof typeof rolesMap | string
): boolean {
    if (!roleName) {
        return false;
    }

    const roles = roleName.split(",").map((r) => r.trim()).filter((r) => r.length > 0);
    const target = String(roleToCheck).trim();

    return roles.includes(target);
}

export { ac, visitor, user, admin, dj };